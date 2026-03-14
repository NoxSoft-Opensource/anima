// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BondingCurveICO
 * @dev Dual-chain ICO with bonding curve pricing until cap, then free market.
 *
 * NoxSoft ICO Tokenomics:
 *   5%  — Team (personal spending)
 *  30%  — Company round (operations)
 *  50%  — Revenue share for holders
 *  15%  — UBC (Universal Basic Compute)
 *
 * Bonding curve: price = initialPrice * (supply/totalSupply)^exponent
 * Cap: $2M, then transitions to free market
 * Transfer tax: 1% on all sales and transfers
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BondingCurveICO is ERC20, Ownable, ReentrancyGuard {
    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1B tokens
    uint256 public constant TARGET_RAISE = 2_000_000 * 1e18; // $2M in wei equivalent
    uint256 public constant INITIAL_PRICE = 1e15; // 0.001 ETH per token
    uint256 public constant TRANSFER_TAX_BPS = 100; // 1% = 100 basis points
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // Allocation percentages (basis points)
    uint256 public constant TEAM_BPS = 500; // 5%
    uint256 public constant COMPANY_BPS = 3000; // 30%
    uint256 public constant REVENUE_SHARE_BPS = 5000; // 50%
    uint256 public constant UBC_BPS = 1500; // 15%

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    uint256 public totalRaised;
    uint256 public bondingSupply; // tokens sold via bonding curve
    bool public bondingActive = true;
    bool public launched = false;

    address public teamWallet;
    address public companyWallet;
    address public revenueShareWallet;
    address public ubcWallet;
    address public taxCollector;

    // Revenue share tracking
    uint256 public revenueShareStartTime;
    uint256 public constant REVENUE_SHARE_DURATION = 730 days; // ~2 years

    // Tax exemptions (e.g. for DEX contracts, internal transfers)
    mapping(address => bool) public taxExempt;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event TokensPurchased(address indexed buyer, uint256 ethSpent, uint256 tokensMinted, uint256 price);
    event BondingCapReached(uint256 totalRaised, uint256 bondingSupply);
    event TransferTaxCollected(address indexed from, address indexed to, uint256 taxAmount);
    event RevenueDistributed(uint256 amount);
    event ICOLaunched(uint256 timestamp);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(
        string memory _name,
        string memory _symbol,
        address _teamWallet,
        address _companyWallet,
        address _revenueShareWallet,
        address _ubcWallet
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        teamWallet = _teamWallet;
        companyWallet = _companyWallet;
        revenueShareWallet = _revenueShareWallet;
        ubcWallet = _ubcWallet;
        taxCollector = _revenueShareWallet; // Tax goes to revenue share pool

        // Mint allocation tokens
        uint256 teamTokens = (TOTAL_SUPPLY * TEAM_BPS) / BPS_DENOMINATOR;
        uint256 companyTokens = (TOTAL_SUPPLY * COMPANY_BPS) / BPS_DENOMINATOR;
        uint256 revenueTokens = (TOTAL_SUPPLY * REVENUE_SHARE_BPS) / BPS_DENOMINATOR;
        uint256 ubcTokens = (TOTAL_SUPPLY * UBC_BPS) / BPS_DENOMINATOR;

        _mint(_teamWallet, teamTokens);
        _mint(_companyWallet, companyTokens);
        _mint(_revenueShareWallet, revenueTokens);
        _mint(_ubcWallet, ubcTokens);

        // Exempt allocation wallets from tax
        taxExempt[_teamWallet] = true;
        taxExempt[_companyWallet] = true;
        taxExempt[_revenueShareWallet] = true;
        taxExempt[_ubcWallet] = true;
        taxExempt[address(this)] = true;
    }

    // -----------------------------------------------------------------------
    // Bonding Curve Purchase
    // -----------------------------------------------------------------------

    /**
     * @dev Buy tokens on the bonding curve. Price increases with supply.
     */
    function buy() external payable nonReentrant {
        require(launched, "ICO not launched");
        require(bondingActive, "Bonding curve ended — trade on free market");
        require(msg.value > 0, "Send ETH to buy tokens");

        uint256 tokensToMint = calculateTokensForEth(msg.value);
        require(tokensToMint > 0, "Too little ETH");

        totalRaised += msg.value;
        bondingSupply += tokensToMint;

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
     * price = INITIAL_PRICE * (bondingSupply / TOTAL_SUPPLY) + INITIAL_PRICE
     */
    function getCurrentPrice() public view returns (uint256) {
        if (!bondingActive) return 0;
        // Linear bonding curve: price increases linearly with supply
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
    // Transfer with Tax
    // -----------------------------------------------------------------------

    /**
     * @dev Override transfer to apply 1% tax.
     */
    function _update(address from, address to, uint256 amount) internal override {
        if (
            from != address(0) && // not minting
            to != address(0) && // not burning
            !taxExempt[from] &&
            !taxExempt[to] &&
            amount > 0
        ) {
            uint256 taxAmount = (amount * TRANSFER_TAX_BPS) / BPS_DENOMINATOR;
            uint256 netAmount = amount - taxAmount;

            // Send tax to collector
            super._update(from, taxCollector, taxAmount);
            emit TransferTaxCollected(from, to, taxAmount);

            // Send net to recipient
            super._update(from, to, netAmount);
        } else {
            super._update(from, to, amount);
        }
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function launch() external onlyOwner {
        require(!launched, "Already launched");
        launched = true;
        revenueShareStartTime = block.timestamp;
        emit ICOLaunched(block.timestamp);
    }

    function setTaxExempt(address account, bool exempt) external onlyOwner {
        taxExempt[account] = exempt;
    }

    function withdrawEth(address to) external onlyOwner {
        require(!bondingActive, "Cannot withdraw during bonding");
        (bool success, ) = to.call{value: address(this).balance}("");
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
        uint256 _percentToTarget
    ) {
        _totalRaised = totalRaised;
        _bondingSupply = bondingSupply;
        _currentPrice = getCurrentPrice();
        _bondingActive = bondingActive;
        _launched = launched;
        _percentToTarget = TARGET_RAISE > 0 ? (totalRaised * 100) / TARGET_RAISE : 0;
    }

    receive() external payable {
        // Accept ETH
    }
}
