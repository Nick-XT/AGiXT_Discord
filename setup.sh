#!/bin/bash

# XTSystems Discord Bot Setup Script
echo "🤖 XTSystems Discord Bot Setup"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}$1${NC}"
}

# Check if required tools are installed
check_requirements() {
    print_header "Checking Requirements..."
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        print_status "Node.js is installed: $NODE_VERSION"
    else
        print_error "Node.js is not installed. Please install Node.js 18+ first."
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        print_status "npm is installed: $NPM_VERSION"
    else
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check GitHub CLI
    if command -v gh &> /dev/null; then
        GH_VERSION=$(gh --version | head -n1)
        print_status "GitHub CLI is installed: $GH_VERSION"
        
        # Check if authenticated
        if gh auth status &> /dev/null; then
            print_status "GitHub CLI is authenticated"
        else
            print_warning "GitHub CLI is not authenticated. Run 'gh auth login' after setup."
        fi
    else
        print_error "GitHub CLI is not installed. Please install GitHub CLI first."
        echo "Visit: https://cli.github.com/"
        exit 1
    fi
    
    echo ""
}

# Install dependencies
install_dependencies() {
    print_header "Installing Dependencies..."
    
    if [ -f "package.json" ]; then
        npm install
        if [ $? -eq 0 ]; then
            print_status "Dependencies installed successfully"
        else
            print_error "Failed to install dependencies"
            exit 1
        fi
    else
        print_error "package.json not found. Are you in the correct directory?"
        exit 1
    fi
    
    echo ""
}

# Setup environment file
setup_environment() {
    print_header "Setting up Environment Configuration..."
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            cp .env.example .env
            print_status "Created .env file from .env.example"
        else
            print_error ".env.example not found"
            exit 1
        fi
    else
        print_warning ".env file already exists. Skipping creation."
    fi
    
    echo ""
    print_status "Please edit the .env file with your configuration:"
    echo "  - DISCORD_TOKEN: Your Discord bot token"
    echo "  - DISCORD_CLIENT_ID: Your Discord application client ID"
    echo "  - DISCORD_GUILD_ID: Your Discord server ID"
    echo "  - GITHUB_TOKEN: Your GitHub personal access token"
    echo "  - XTSYSTEMS_API_URL: Your XTSystems API URL"
    echo "  - XTSYSTEMS_API_KEY: Your XTSystems API key"
    echo "  - AGIXT_API_URL: Your AGiXT API URL (optional)"
    echo "  - AGIXT_API_KEY: Your AGiXT API key (optional)"
    echo ""
}

# Create necessary directories
create_directories() {
    print_header "Creating Directories..."
    
    directories=("logs" "config" "temp")
    
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            print_status "Created directory: $dir"
        else
            print_status "Directory already exists: $dir"
        fi
    done
    
    echo ""
}

# Test configuration
test_configuration() {
    print_header "Testing Configuration..."
    
    if [ -f ".env" ]; then
        # Source the .env file
        set -a
        source .env
        set +a
        
        # Check required variables
        required_vars=("DISCORD_TOKEN" "DISCORD_CLIENT_ID" "DISCORD_GUILD_ID" "XTSYSTEMS_API_URL" "XTSYSTEMS_API_KEY")
        
        for var in "${required_vars[@]}"; do
            if [ -z "${!var}" ] || [ "${!var}" = "your_${var,,}_here" ]; then
                print_warning "$var is not configured"
            else
                print_status "$var is configured"
            fi
        done
        
        # Check optional variables
        optional_vars=("AGIXT_API_URL" "AGIXT_API_KEY" "GITHUB_TOKEN")
        
        for var in "${optional_vars[@]}"; do
            if [ -z "${!var}" ] || [ "${!var}" = "your_${var,,}_here" ]; then
                print_warning "$var is not configured (optional)"
            else
                print_status "$var is configured"
            fi
        done
    else
        print_error ".env file not found"
    fi
    
    echo ""
}

# Main setup process
main() {
    echo "This script will help you set up the XTSystems Discord Bot."
    echo ""
    
    check_requirements
    install_dependencies
    create_directories
    setup_environment
    test_configuration
    
    print_header "Setup Complete!"
    print_status "Next steps:"
    echo "  1. Edit the .env file with your configuration"
    echo "  2. Authenticate with GitHub CLI: gh auth login"
    echo "  3. Test the bot: npm run dev"
    echo "  4. Deploy to production: npm start"
    echo ""
    echo "For more information, see the README.md file."
    echo ""
    print_status "Happy coding! 🚀"
}

# Run main function
main
