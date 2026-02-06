#!/bin/bash
# OpenSPC Frontend Startup Script (Unix/Mac/Git Bash)

# Colors
BLUE='\033[38;5;25m'
TEAL='\033[38;5;80m'
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
GRAY='\033[90m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}${BLUE}  ██████╗ ██████╗ ███████╗███╗   ██╗███████╗██████╗  ██████╗${RESET}"
echo -e "${BOLD}${BLUE} ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔══██╗██╔════╝${RESET}"
echo -e "${BOLD}${BLUE} ██║   ██║██████╔╝█████╗  ██╔██╗ ██║███████╗██████╔╝██║     ${RESET}"
echo -e "${BOLD}${BLUE} ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║╚════██║██╔═══╝ ██║     ${RESET}"
echo -e "${BOLD}${BLUE} ╚██████╔╝██║     ███████╗██║ ╚████║███████║██║     ╚██████╗${RESET}"
echo -e "${BOLD}${BLUE}  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝      ╚═════╝${RESET}"
echo ""
echo -e " ${DIM}─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─${RESET}${GRAY} UCL${RESET}"
echo -e " ${TEAL}      ●            ●                       ●${RESET}"
echo -e " ${TEAL}● ─ ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ●${RESET}${GRAY}  CL${RESET}"
echo -e " ${TEAL}                ●              ●${RESET}"
echo -e " ${DIM}─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─${RESET}${GRAY} LCL${RESET}"
echo ""
echo -e " ${DIM}Statistical Process Control Platform${RESET}"
echo -e " ${DIM}Frontend Application${RESET}"
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
