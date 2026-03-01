#!/usr/bin/env bash
# AnimaDock - Docker helpers for Anima
# Inspired by Simon Willison's "Running Anima in Docker"
# https://til.simonwillison.net/llms/anima-docker
#
# Installation:
#   mkdir -p ~/.animadock && curl -sL https://raw.githubusercontent.com/anima/anima/main/scripts/shell-helpers/animadock-helpers.sh -o ~/.animadock/animadock-helpers.sh
#   echo 'source ~/.animadock/animadock-helpers.sh' >> ~/.zshrc
#
# Usage:
#   animadock-help    # Show all available commands

# =============================================================================
# Colors
# =============================================================================
_CLR_RESET='\033[0m'
_CLR_BOLD='\033[1m'
_CLR_DIM='\033[2m'
_CLR_GREEN='\033[0;32m'
_CLR_YELLOW='\033[1;33m'
_CLR_BLUE='\033[0;34m'
_CLR_MAGENTA='\033[0;35m'
_CLR_CYAN='\033[0;36m'
_CLR_RED='\033[0;31m'

# Styled command output (green + bold)
_clr_cmd() {
  echo -e "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

# Inline command for use in sentences
_cmd() {
  echo "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

# =============================================================================
# Config
# =============================================================================
ANIMADOCK_CONFIG="${HOME}/.animadock/config"

# Common paths to check for Anima
ANIMADOCK_COMMON_PATHS=(
  "${HOME}/anima"
  "${HOME}/workspace/anima"
  "${HOME}/projects/anima"
  "${HOME}/dev/anima"
  "${HOME}/code/anima"
  "${HOME}/src/anima"
)

_animadock_filter_warnings() {
  grep -v "^WARN\|^time="
}

_animadock_trim_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf "%s" "$value"
}

_animadock_read_config_dir() {
  if [[ ! -f "$ANIMADOCK_CONFIG" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^ANIMADOCK_DIR=//p' "$ANIMADOCK_CONFIG" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _animadock_trim_quotes "$raw"
}

# Ensure ANIMADOCK_DIR is set and valid
_animadock_ensure_dir() {
  # Already set and valid?
  if [[ -n "$ANIMADOCK_DIR" && -f "${ANIMADOCK_DIR}/docker-compose.yml" ]]; then
    return 0
  fi

  # Try loading from config
  local config_dir
  config_dir=$(_animadock_read_config_dir)
  if [[ -n "$config_dir" && -f "${config_dir}/docker-compose.yml" ]]; then
    ANIMADOCK_DIR="$config_dir"
    return 0
  fi

  # Auto-detect from common paths
  local found_path=""
  for path in "${ANIMADOCK_COMMON_PATHS[@]}"; do
    if [[ -f "${path}/docker-compose.yml" ]]; then
      found_path="$path"
      break
    fi
  done

  if [[ -n "$found_path" ]]; then
    echo ""
    echo "🦞 Found Anima at: $found_path"
    echo -n "   Use this location? [Y/n] "
    read -r response
    if [[ "$response" =~ ^[Nn] ]]; then
      echo ""
      echo "Set ANIMADOCK_DIR manually:"
      echo "  export ANIMADOCK_DIR=/path/to/anima"
      return 1
    fi
    ANIMADOCK_DIR="$found_path"
  else
    echo ""
    echo "❌ Anima not found in common locations."
    echo ""
    echo "Clone it first:"
    echo ""
    echo "  git clone https://github.com/anima/anima.git ~/anima"
    echo "  cd ~/anima && ./docker-setup.sh"
    echo ""
    echo "Or set ANIMADOCK_DIR if it's elsewhere:"
    echo ""
    echo "  export ANIMADOCK_DIR=/path/to/anima"
    echo ""
    return 1
  fi

  # Save to config
  if [[ ! -d "${HOME}/.animadock" ]]; then
    /bin/mkdir -p "${HOME}/.animadock"
  fi
  echo "ANIMADOCK_DIR=\"$ANIMADOCK_DIR\"" > "$ANIMADOCK_CONFIG"
  echo "✅ Saved to $ANIMADOCK_CONFIG"
  echo ""
  return 0
}

# Wrapper to run docker compose commands
_animadock_compose() {
  _animadock_ensure_dir || return 1
  command docker compose -f "${ANIMADOCK_DIR}/docker-compose.yml" "$@"
}

_animadock_read_env_token() {
  _animadock_ensure_dir || return 1
  if [[ ! -f "${ANIMADOCK_DIR}/.env" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^ANIMA_GATEWAY_TOKEN=//p' "${ANIMADOCK_DIR}/.env" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _animadock_trim_quotes "$raw"
}

# Basic Operations
animadock-start() {
  _animadock_compose up -d anima-gateway
}

animadock-stop() {
  _animadock_compose down
}

animadock-restart() {
  _animadock_compose restart anima-gateway
}

animadock-logs() {
  _animadock_compose logs -f anima-gateway
}

animadock-status() {
  _animadock_compose ps
}

# Navigation
animadock-cd() {
  _animadock_ensure_dir || return 1
  cd "${ANIMADOCK_DIR}"
}

animadock-config() {
  cd ~/.anima
}

animadock-workspace() {
  cd ~/.anima/workspace
}

# Container Access
animadock-shell() {
  _animadock_compose exec anima-gateway \
    bash -c 'echo "alias anima=\"./anima.mjs\"" > /tmp/.bashrc_anima && bash --rcfile /tmp/.bashrc_anima'
}

animadock-exec() {
  _animadock_compose exec anima-gateway "$@"
}

animadock-cli() {
  _animadock_compose run --rm anima-cli "$@"
}

# Maintenance
animadock-rebuild() {
  _animadock_compose build anima-gateway
}

animadock-clean() {
  _animadock_compose down -v --remove-orphans
}

# Health check
animadock-health() {
  _animadock_ensure_dir || return 1
  local token
  token=$(_animadock_read_env_token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${ANIMADOCK_DIR}/.env"
    return 1
  fi
  _animadock_compose exec -e "ANIMA_GATEWAY_TOKEN=$token" anima-gateway \
    node dist/index.js health
}

# Show gateway token
animadock-token() {
  _animadock_read_env_token
}

# Fix token configuration (run this once after setup)
animadock-fix-token() {
  _animadock_ensure_dir || return 1

  echo "🔧 Configuring gateway token..."
  local token
  token=$(animadock-token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${ANIMADOCK_DIR}/.env"
    return 1
  fi

  echo "📝 Setting token: ${token:0:20}..."

  _animadock_compose exec -e "TOKEN=$token" anima-gateway \
    bash -c './anima.mjs config set gateway.remote.token "$TOKEN" && ./anima.mjs config set gateway.auth.token "$TOKEN"' 2>&1 | _animadock_filter_warnings

  echo "🔍 Verifying token was saved..."
  local saved_token
  saved_token=$(_animadock_compose exec anima-gateway \
    bash -c "./anima.mjs config get gateway.remote.token 2>/dev/null" 2>&1 | _animadock_filter_warnings | tr -d '\r\n' | head -c 64)

  if [[ "$saved_token" == "$token" ]]; then
    echo "✅ Token saved correctly!"
  else
    echo "⚠️  Token mismatch detected"
    echo "   Expected: ${token:0:20}..."
    echo "   Got: ${saved_token:0:20}..."
  fi

  echo "🔄 Restarting gateway..."
  _animadock_compose restart anima-gateway 2>&1 | _animadock_filter_warnings

  echo "⏳ Waiting for gateway to start..."
  sleep 5

  echo "✅ Configuration complete!"
  echo -e "   Try: $(_cmd animadock-devices)"
}

# Open dashboard in browser
animadock-dashboard() {
  _animadock_ensure_dir || return 1

  echo "🦞 Getting dashboard URL..."
  local output exit_status url
  output=$(_animadock_compose run --rm anima-cli dashboard --no-open 2>&1)
  exit_status=$?
  url=$(printf "%s\n" "$output" | _animadock_filter_warnings | grep -o 'http[s]\?://[^[:space:]]*' | head -n 1)
  if [[ $exit_status -ne 0 ]]; then
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd animadock-restart)"
    return 1
  fi

  if [[ -n "$url" ]]; then
    echo "✅ Opening: $url"
    open "$url" 2>/dev/null || xdg-open "$url" 2>/dev/null || echo "   Please open manually: $url"
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see 'pairing required' error:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd animadock-devices)"
    echo "   2. Copy the Request ID from the Pending table"
    echo -e "   3. Run: $(_cmd 'animadock-approve <request-id>')"
  else
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd animadock-restart)"
  fi
}

# List device pairings
animadock-devices() {
  _animadock_ensure_dir || return 1

  echo "🔍 Checking device pairings..."
  local output exit_status
  output=$(_animadock_compose exec anima-gateway node dist/index.js devices list 2>&1)
  exit_status=$?
  printf "%s\n" "$output" | _animadock_filter_warnings
  if [ $exit_status -ne 0 ]; then
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see token errors above:${_CLR_RESET}"
    echo -e "   1. Verify token is set: $(_cmd animadock-token)"
    echo "   2. Try manual config inside container:"
    echo -e "      $(_cmd animadock-shell)"
    echo -e "      $(_cmd 'anima config get gateway.remote.token')"
    return 1
  fi

  echo ""
  echo -e "${_CLR_CYAN}💡 To approve a pairing request:${_CLR_RESET}"
  echo -e "   $(_cmd 'animadock-approve <request-id>')"
}

# Approve device pairing request
animadock-approve() {
  _animadock_ensure_dir || return 1

  if [[ -z "$1" ]]; then
    echo -e "❌ Usage: $(_cmd 'animadock-approve <request-id>')"
    echo ""
    echo -e "${_CLR_CYAN}💡 How to approve a device:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd animadock-devices)"
    echo "   2. Find the Request ID in the Pending table (long UUID)"
    echo -e "   3. Run: $(_cmd 'animadock-approve <that-request-id>')"
    echo ""
    echo "Example:"
    echo -e "   $(_cmd 'animadock-approve 6f9db1bd-a1cc-4d3f-b643-2c195262464e')"
    return 1
  fi

  echo "✅ Approving device: $1"
  _animadock_compose exec anima-gateway \
    node dist/index.js devices approve "$1" 2>&1 | _animadock_filter_warnings

  echo ""
  echo "✅ Device approved! Refresh your browser."
}

# Show all available animadock helper commands
animadock-help() {
  echo -e "\n${_CLR_BOLD}${_CLR_CYAN}🦞 AnimaDock - Docker Helpers for Anima${_CLR_RESET}\n"

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚡ Basic Operations${_CLR_RESET}"
  echo -e "  $(_cmd animadock-start)       ${_CLR_DIM}Start the gateway${_CLR_RESET}"
  echo -e "  $(_cmd animadock-stop)        ${_CLR_DIM}Stop the gateway${_CLR_RESET}"
  echo -e "  $(_cmd animadock-restart)     ${_CLR_DIM}Restart the gateway${_CLR_RESET}"
  echo -e "  $(_cmd animadock-status)      ${_CLR_DIM}Check container status${_CLR_RESET}"
  echo -e "  $(_cmd animadock-logs)        ${_CLR_DIM}View live logs (follows)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🐚 Container Access${_CLR_RESET}"
  echo -e "  $(_cmd animadock-shell)       ${_CLR_DIM}Shell into container (anima alias ready)${_CLR_RESET}"
  echo -e "  $(_cmd animadock-cli)         ${_CLR_DIM}Run CLI commands (e.g., animadock-cli status)${_CLR_RESET}"
  echo -e "  $(_cmd animadock-exec) ${_CLR_CYAN}<cmd>${_CLR_RESET}  ${_CLR_DIM}Execute command in gateway container${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🌐 Web UI & Devices${_CLR_RESET}"
  echo -e "  $(_cmd animadock-dashboard)   ${_CLR_DIM}Open web UI in browser ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd animadock-devices)     ${_CLR_DIM}List device pairings ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd animadock-approve) ${_CLR_CYAN}<id>${_CLR_RESET} ${_CLR_DIM}Approve device pairing ${_CLR_CYAN}(with examples)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚙️  Setup & Configuration${_CLR_RESET}"
  echo -e "  $(_cmd animadock-fix-token)   ${_CLR_DIM}Configure gateway token ${_CLR_CYAN}(run once)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🔧 Maintenance${_CLR_RESET}"
  echo -e "  $(_cmd animadock-rebuild)     ${_CLR_DIM}Rebuild Docker image${_CLR_RESET}"
  echo -e "  $(_cmd animadock-clean)       ${_CLR_RED}⚠️  Remove containers & volumes (nuclear)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🛠️  Utilities${_CLR_RESET}"
  echo -e "  $(_cmd animadock-health)      ${_CLR_DIM}Run health check${_CLR_RESET}"
  echo -e "  $(_cmd animadock-token)       ${_CLR_DIM}Show gateway auth token${_CLR_RESET}"
  echo -e "  $(_cmd animadock-cd)          ${_CLR_DIM}Jump to anima project directory${_CLR_RESET}"
  echo -e "  $(_cmd animadock-config)      ${_CLR_DIM}Open config directory (~/.anima)${_CLR_RESET}"
  echo -e "  $(_cmd animadock-workspace)   ${_CLR_DIM}Open workspace directory${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo -e "${_CLR_BOLD}${_CLR_GREEN}🚀 First Time Setup${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  1.${_CLR_RESET} $(_cmd animadock-start)          ${_CLR_DIM}# Start the gateway${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  2.${_CLR_RESET} $(_cmd animadock-fix-token)      ${_CLR_DIM}# Configure token${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  3.${_CLR_RESET} $(_cmd animadock-dashboard)      ${_CLR_DIM}# Open web UI${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  4.${_CLR_RESET} $(_cmd animadock-devices)        ${_CLR_DIM}# If pairing needed${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  5.${_CLR_RESET} $(_cmd animadock-approve) ${_CLR_CYAN}<id>${_CLR_RESET}   ${_CLR_DIM}# Approve pairing${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_GREEN}💬 WhatsApp Setup${_CLR_RESET}"
  echo -e "  $(_cmd animadock-shell)"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'anima channels login --channel whatsapp')"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'anima status')"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_CYAN}💡 All commands guide you through next steps!${_CLR_RESET}"
  echo -e "${_CLR_BLUE}📚 Docs: ${_CLR_RESET}${_CLR_CYAN}https://docs.anima.ai${_CLR_RESET}"
  echo ""
}
