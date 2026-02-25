#!/bin/bash
# Cassini Frontend Startup Script (Unix/Mac/Git Bash)

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
echo -e " ${DIM}SPC Platform ${CREAM}// ${DIM}Frontend Application${RESET}"
echo -e " ${DIM}\"In-control, like the Cassini Division\"${RESET}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: npm install failed"
        exit 1
    fi
    echo
fi

echo -e " ${GREEN}→${RESET} Frontend: ${GREEN}http://localhost:5173${RESET}"
echo -e " ${DIM}  Press Ctrl+C to stop${RESET}"
echo

npm run dev
