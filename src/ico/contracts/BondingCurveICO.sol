// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BondingCurveICO
 * @dev Dual-chain ICO with bonding curve pricing until cap, then free market.
 * @notice Hardened for production: pause, vesting, max purchase, address validation.
 *
 * NoxSoft ICO Tokenomics:
 *   5%  — Team (personal spending, vested 12 months)
 *  30%  — Company round (operations)
 *  50%  — Revenue share for holders
 *  15%  — UBC (Universal Basic Compute)
 *
 * Bonding curve: price = initialPrice + initialPrice * supply / totalSupply
 * Cap: $2M, then transitions to free market
 * Transfer tax: 1% on all sales and transfers
 * Platform tax: 0.5% collected by NoxSoft on all raises
 *
 * Security: ReentrancyGuard, Pausable, address validation, max purchase limit
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract BondingCurveICO is ERC20, Ownable, ReentrancyGuard, Pausable {
    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1B tokens
    uint256 public constant TARGET_RAISE = 2_000_000 * 1e18; // $2M in wei equivalent
    uint256 public constant INITIAL_PRICE = 1e15; // 0.001 ETH per token
    uint256 public constant TRANSFER_TAX_BPS = 100; // 1% = 100 basis points
    uint256 public constant PLATFORM_TAX_BPS = 50; // 0.5% platform tax
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_PURCHASE_PER_TX = 100_000 * 1e18; // Max 100K tokens per tx

    // Allocation percentages (basis points)
    uint256 public constant TEAM_BPS = 500; // 5%
    uint256 public constant COMPANY_BPS = 3000; // 30%
    uint256 public constant REVENUE_SHARE_BPS = 5000; // 50%
    uint256 public constant UBC_BPS = 1500; // 15%

    // Vesting
    uint256 public constant TEAM_VESTING_DURATION = 365 days; // 12 months
    uint256 public constant TEAM_CLIFF = 90 days; // 3 month cliff

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    uint256 public totalRaised;
    uint256 public bondingSupply; // tokens sold via bonding curve
    bool public bondingActive = true;
    bool public launched = false;

    address public immutable teamWallet;
    address public immutable companyWallet;
    address public immutable revenueShareWallet;
    address public immutable ubcWallet;
    address public immutable platformWallet; // NoxSoft platform tax recipient
    address public taxCollector;

    // Revenue share tracking
    uint256 public revenueShareStartTime;
    uint256 public constant REVENUE_SHARE_DURATION = 730 days; // ~2 years

    // Team vesting
    uint256 public teamVestingStart;
    uint256 public teamTokensClaimed;
    uint256 public teamTotalAllocation;

    // Tax exemptions (e.g. for DEX contracts, internal transfers)
    mapping(address => bool) public taxExempt;

    // Purchase tracking (anti-whale)
    mapping(address => uint256) public totalPurchased;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event TokensPurchased(address indexed buyer, uint256 ethSpent, uint256 tokensMinted, uint256 price);
    event BondingCapReached(uint256 totalRaised, uint256 bondingSupply);
    event TransferTaxCollected(address indexed from, address indexed to, uint256 taxAmount);
    event PlatformTaxCollected(uint256 amount);
    event RevenueDistributed(uint256 amount);
    event ICOLaunched(uint256 timestamp);
    event TeamTokensClaimed(address indexed to, uint256 amount);
    event EmergencyPause(address indexed by);
    event EmergencyUnpause(address indexed by);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(
        string memory _name,
        string memory _symbol,
        address _teamWallet,
        address _companyWallet,
        address _revenueShareWallet,
        address _ubcWallet,
        address _platformWallet
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(_teamWallet != address(0), "Invalid team wallet");
        require(_companyWallet != address(0), "Invalid company wallet");
        require(_revenueShareWallet != address(0), "Invalid revenue share wallet");
        require(_ubcWallet != address(0), "Invalid UBC wallet");
        require(_platformWallet != address(0), "Invalid platform wallet");

        teamWallet = _teamWallet;
        companyWallet = _companyWallet;
        revenueShareWallet = _revenueShareWallet;
        ubcWallet = _ubcWallet;
        platformWallet = _platformWallet;
        taxCollector = _revenueShareWallet;

        // Mint non-vested allocations immediately
        uint256 companyTokens = (TOTAL_SUPPLY * COMPANY_BPS) / BPS_DENOMINATOR;
        uint256 revenueTokens = (TOTAL_SUPPLY * REVENUE_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 ubcTokens = (TOTAL_SUPPLY * UBC_BPS) / BPS_DENOMINATOR;

        _mint(_companyWallet, companyTokens);
        _mint(_revenueShareWallet, revenueTokens);
        _mint(_ubcWallet, ubcTokens);

        // Team tokens are vested — held by contract until claimed
        teamTotalAllocation = (TOTAL_SUPPLY * TEAM_BPS) / BPS_DENOMINATOR;
        _mint(address(this), teamTotalAllocation);

        // Exempt allocation wallets from tax
        taxExempt[_teamWallet] = true;
        taxExempt[_companyWallet] = true;
        taxExempt[_revenueShareWallet] = true;
        taxExempt[_ubcWallet] = true;
        taxExempt[_platformWallet] = true;
        taxExempt[address(this)] = true;
    }

    // -----------------------------------------------------------------------
    // Bonding Curve Purchase
    // -----------------------------------------------------------------------

    /**
     * @dev Buy tokens on the bonding curve. Price increases with supply.
     */
    function buy() external payable nonReentrant whenNotPaused {
        require(launched, "ICO not launched");
        require(bondingActive, "Bonding curve ended");
        require(msg.value > 0, "Send ETH to buy tokens");

        uint256 tokensToMint = calculateTokensForEth(msg.value);
        require(tokensToMint > 0, "Too little ETH");
        require(tokensToMint <= MAX_PURCHASE_PER_TX, "Exceeds max purchase per tx");

        // Platform tax (0.5% of ETH raised)
        uint256 platformTax = (msg.value * PLATFORM_TAX_BPS) / BPS_DENOMINATOR;
        if (platformTax > 0) {
            (bool taxSuccess, ) = platformWallet.call{value: platformTax}("");
            require(taxSuccess, "Platform tax transfer failed");
            emit PlatformTaxCollected(platformTax);
        }

        totalRaised += msg.value;
        bondingSupply += tokensToMint;
        totalPurchased[msg.sender] += tokensToMint;

        _mint(msg.sender, tokensToMint);

        emit TokensPurchased(msg.sender, msg.value, tokensToMint, getCurrentPrice());

        // Check if cap reached
        if (totalRaised >= TARGET_RAISE) {
            bondingActive = false;
            emit BondingCapReached(totalRaised, bondingSupply);
        }
    }

    /**
     * @dev Calculate current price based on bonding curve.
     * Linear: price = INITIAL_PRICE + INITIAL_PRICE * bondingSupply / TOTAL_SUPPLY
     */
    function getCurrentPrice() public view returns (uint256) {
        if (!bondingActive) return 0;
        return INITIAL_PRICE + (INITIAL_PRICE * bondingSupply) / TOTAL_SUPPLY;
    }

    /**
     * @dev Calculate tokens received for a given ETH amount.
     */
    function calculateTokensForEth(uint256 ethAmount) public view returns (uint256) {
        uint256 price = getCurrentPrice();
        if (price == 0) return 0;
        return (ethAmount * 1e18) / price;
    }

    // -----------------------------------------------------------------------
    // Team Vesting
    // -----------------------------------------------------------------------

    /**
     * @dev Claim vested team tokens. Linear vesting after cliff.
     */
    function claimTeamTokens() external {
        require(msg.sender == teamWallet, "Only team wallet");
        require(launched, "ICO not launched");
        require(block.timestamp >= teamVestingStart + TEAM_CLIFF, "Cliff not reached");

        uint256 vested = _vestedAmount();
        uint256 claimable = vested - teamTokensClaimed;
        require(claimable > 0, "Nothing to claim");

        teamTokensClaimed += claimable;
        _transfer(address(this), teamWallet, claimable);

        emit TeamTokensClaimed(teamWallet, claimable);
    }

    function _vestedAmount() internal view returns (uint256) {
        if (block.timestamp < teamVestingStart + TEAM_CLIFF) {
            return 0;
        }
        uint256 elapsed = block.timestamp - teamVestingStart;
        if (elapsed >= TEAM_VESTING_DURATION) {
            return teamTotalAllocation;
        }
        return (teamTotalAllocation * elapsed) / TEAM_VESTING_DURATION;
    }

    function getVestedAmount() external view returns (uint256 vested, uint256 claimed, uint256 claimable) {
        vested = _vestedAmount();
        claimed = teamTokensClaimed;
        claimable = vested > claimed ? vested - claimed : 0;
    }

    // -----------------------------------------------------------------------
    // Transfer with Tax
    // -----------------------------------------------------------------------

    /**
     * @dev Override transfer to apply 1% tax.
     */
    function _update(address from, address to, uint256 amount) internal override {
        if (
            from != address(0) &&
            to != address(0) &&
            !taxExempt[from] &&
            !taxExempt[to] &&
            amount > 0
        ) {
            uint256 taxAmount = (amount * TRANSFER_TAX_BPS) / BPS_DENOMINATOR;
            uint256 netAmount = amount - taxAmount;

            super._update(from, taxCollector, taxAmount);
            emit TransferTaxCollected(from, to, taxAmount);

            super._update(from, to, netAmount);
        } else {
            super._update(from, to, amount);
        }
    }

    // -----------------------------------------------------------------------
    // Emergency Controls
    // -----------------------------------------------------------------------

    function pause() external onlyOwner {
        _pause();
        emit EmergencyPause(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpause(msg.sender);
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function launch() external onlyOwner {
        require(!launched, "Already launched");
        launched = true;
        revenueShareStartTime = block.timestamp;
        teamVestingStart = block.timestamp;
        emit ICOLaunched(block.timestamp);
    }

    function setTaxExempt(address account, bool exempt) external onlyOwner {
        require(account != address(0), "Invalid address");
        taxExempt[account] = exempt;
    }

    function setTaxCollector(address _taxCollector) external onlyOwner {
        require(_taxCollector != address(0), "Invalid address");
        taxCollector = _taxCollector;
    }

    function withdrawEth(address to) external onlyOwner {
        require(!bondingActive, "Cannot withdraw during bonding");
        require(to != address(0), "Invalid address");
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool success, ) = to.call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    function isRevenueShareActive() public view returns (bool) {
        if (revenueShareStartTime == 0) return false;
        return block.timestamp < revenueShareStartTime + REVENUE_SHARE_DURATION;
    }

    // -----------------------------------------------------------------------
    // View
    // -----------------------------------------------------------------------

    function getIcoStatus() external view returns (
        uint256 _totalRaised,
        uint256 _bondingSupply,
        uint256 _currentPrice,
        bool _bondingActive,
        bool _launched,
        uint256 _percentToTarget,
        bool _paused
    ) {
        _totalRaised = totalRaised;
        _bondingSupply = bondingSupply;
        _currentPrice = getCurrentPrice();
        _bondingActive = bondingActive;
        _launched = launched;
        _percentToTarget = TARGET_RAISE > 0 ? (totalRaised * 100) / TARGET_RAISE : 0;
        _paused = paused();
    }

    receive() external payable {
        // Accept ETH
    }
}
