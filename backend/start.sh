#!/bin/bash
# Cassini Backend Startup Script (Unix/Mac/Git Bash)

# Colors — Cassini Aerospace palette
GOLD='\033[38;2;212;175;55m'
CREAM='\033[38;2;244;241;222m'
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
GRAY='\033[90m'
ORANGE='\033[38;2;224;90;61m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}${GOLD}  ██████╗  █████╗  ██████╗ ██████╗ ██╗███╗   ██╗██╗${RESET}"
echo -e "${BOLD}${GOLD} ██╔════╝ ██╔══██╗██╔════╝██╔════╝ ██║████╗  ██║██║${RESET}"
echo -e "${BOLD}${GOLD} ██║      ███████║╚█████╗ ╚█████╗  ██║██╔██╗ ██║██║${RESET}"
echo -e "${BOLD}${GOLD} ██║      ██╔══██║ ╚═══██╗ ╚═══██╗ ██║██║╚██╗██║██║${RESET}"
echo -e "${BOLD}${GOLD} ╚██████╗ ██║  ██║██████╔╝██████╔╝ ██║██║ ╚████║██║${RESET}"
echo -e "${BOLD}${GOLD}  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═════╝  ╚═╝╚═╝  ╚═══╝╚═╝${RESET}"
echo ""
echo -e "${CREAM}         by ${BOLD}Saturnis${RESET}${CREAM} LLC${RESET}"
echo ""
echo -e " ${DIM}╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌${RESET} ${ORANGE}UCL${RESET}"
echo -e " ${GOLD}       ●            ●                          ●${RESET}"
echo -e " ${GOLD} ● ╌╌╌╌╌╌╌ ● ╌╌╌╌╌╌╌╌ ● ╌╌╌╌╌ ● ╌╌╌╌╌╌╌╌ ● ╌ ●${RESET}  ${CREAM}CL${RESET}"
echo -e " ${GOLD}                 ●               ●${RESET}"
echo -e " ${DIM}╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌${RESET} ${ORANGE}LCL${RESET}"
echo ""
echo -e " ${GRAY}                 .  *  .     .   *   .${RESET}"
echo -e " ${GRAY}              .        ${GOLD}____${GRAY}         .${RESET}"
echo -e " ${GRAY}          *        ${GOLD},o88888o.${GRAY}     *${RESET}"
echo -e " ${GRAY}               ${GOLD},o8888888888o.${RESET}"
echo -e " ${GOLD}        ~~~~~ o888888888888888o ~~~~~${RESET}"
echo -e " ${GOLD}        ===== O888888888888888O =====${RESET}"
echo -e " ${GOLD}        ~~~~~ \`o8888888888888' ~~~~~${RESET}"
echo -e " ${GRAY}               ${GOLD}\`o88888888o'${RESET}"
echo -e " ${GRAY}          *        ${GOLD}\`\"\"\"\"'${GRAY}     *${RESET}"
echo -e " ${GRAY}              .               .${RESET}"
echo ""
echo -e " ${DIM}SPC Platform ${CREAM}// ${DIM}Backend API Server${RESET}"
echo -e " ${DIM}\"In-control, like the Cassini Division\"${RESET}"
echo ""

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate

# Install dependencies
echo "Checking dependencies..."
pip install -e . -q

# Run database migrations
echo
echo "Running database migrations..."
alembic upgrade head
if [ $? -ne 0 ]; then
    echo "WARNING: Migration failed - database may need setup"
    echo "Run: alembic upgrade head"
    echo
fi

# Start the server
echo
echo -e " ${GREEN}→${RESET} Backend:  ${GREEN}http://localhost:8000${RESET}"
echo -e " ${GREEN}→${RESET} API Docs: ${GREEN}http://localhost:8000/docs${RESET}"
echo -e " ${DIM}  Press Ctrl+C to stop${RESET}"
echo

uvicorn cassini.main:app --reload --host 0.0.0.0 --port 8000
