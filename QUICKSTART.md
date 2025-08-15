# Quick Start Guide

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] GitHub CLI installed and authenticated (`gh auth login`)
- [ ] Discord bot created and invited to server
- [ ] XTSystems instance running and accessible
- [ ] AGiXT instance running (optional but recommended)

## 5-Minute Setup

### 1. Clone and Setup
```bash
git clone https://github.com/Nick-XT/AGiXT_Discord.git
cd AGiXT_Discord
./setup.sh
```

### 2. Configure Environment
Edit `.env` file with your credentials:
```bash
nano .env
```

**Required:**
- `DISCORD_TOKEN` - From Discord Developer Portal
- `DISCORD_CLIENT_ID` - From Discord Developer Portal
- `DISCORD_GUILD_ID` - Your Discord server ID
- `XTSYSTEMS_API_URL` - Your XTSystems API endpoint
- `XTSYSTEMS_API_KEY` - Your XTSystems API key

**Optional:**
- `AGIXT_API_URL` - Your AGiXT API endpoint
- `AGIXT_API_KEY` - Your AGiXT API key

### 3. Run the Bot
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

### 4. Setup Webhooks (Optional but Recommended)
```bash
# Register Discord bot as webhook in XTSystems
npm run webhook:register

# Or use the Discord slash command
# /register-webhook in Discord
```

## Getting Discord Credentials

### 1. Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Give it a name (e.g., "XTSystems Bot")
4. Copy the **Application ID** → `DISCORD_CLIENT_ID`

### 2. Create Bot
1. Go to "Bot" section
2. Click "Add Bot"
3. Copy the **Token** → `DISCORD_TOKEN`
4. Enable these permissions:
   - Send Messages
   - Use Slash Commands
   - Read Message History
   - Embed Links

### 3. Invite Bot to Server
1. Go to "OAuth2 > URL Generator"
2. Select scopes: `bot` and `applications.commands`
3. Select bot permissions (same as above)
4. Use generated URL to invite bot

### 4. Get Server ID
1. Enable Developer Mode in Discord
2. Right-click your server → "Copy ID"
3. This is your `DISCORD_GUILD_ID`

## Testing the Bot

### 1. Basic Commands
- `/bot-status` - Check if bot is working
- `/help` - Get help information

### 2. Issue Management
- `/create-issue` - Create a GitHub issue
- `/list-issues` - List recent issues
- `/close-issue` - Close an issue

### 3. Ticket Management
- `/create-ticket` - Create XTSystems ticket

### 4. AI Features
- `/analyze-conversation` - Analyze recent chat for issues
- `/toggle-monitoring` - Enable auto-monitoring

### 5. Webhook Management
- `/webhook-status` - Check webhook server status
- `/register-webhook` - Register bot in XTSystems
- `/test-webhook` - Test webhook connectivity
- `/webhook-config` - Show webhook configuration

## Webhook Integration

### Bot Not Responding
1. Check bot is online in Discord
2. Verify token is correct
3. Check console for errors

### GitHub Integration Not Working
```bash
# Test GitHub CLI authentication
gh auth status

# Test repository access
gh repo view DevXT-LLC/xtsystems
```

### XTSystems Integration Not Working
1. Check XTSystems is running
2. Verify API URL and key
3. Test API endpoint manually

### AGiXT Integration Not Working
1. Check AGiXT is running
2. Verify API URL and key
3. Bot will fallback to keyword analysis if AGiXT fails

## Production Deployment

### Docker
```bash
# Build and run with Docker
docker build -t xtsystems-discord-bot .
docker run -d --env-file .env xtsystems-discord-bot

# Or use Docker Compose
docker-compose up -d
```

### PM2 (Process Manager)
```bash
# Install PM2
npm install -g pm2

# Start bot with PM2
pm2 start index.js --name "xtsystems-bot"

# Monitor
pm2 status
pm2 logs xtsystems-bot
```

### Systemd Service
```bash
# Create service file
sudo nano /etc/systemd/system/xtsystems-bot.service

# Start service
sudo systemctl enable xtsystems-bot
sudo systemctl start xtsystems-bot
```

## Configuration Examples

### Basic Configuration (.env)
```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
XTSYSTEMS_API_URL=http://localhost:20437
XTSYSTEMS_API_KEY=your_api_key
AUTO_CREATE_ISSUES=false
LOG_LEVEL=info
```

### Advanced Configuration
```bash
# Enable auto-monitoring for specific channels
MONITOR_CHANNELS=123456789,987654321
AUTO_CREATE_ISSUES=true
ANALYSIS_THRESHOLD=5

# AGiXT for AI analysis
AGIXT_API_URL=http://localhost:7437
AGIXT_API_KEY=your_agixt_key

# Custom repository
REPO_OWNER=YourOrg
REPO_NAME=your-repo
```

## Troubleshooting Commands

```bash
# Check logs
tail -f logs/combined.log
tail -f logs/error.log

# Test GitHub CLI
gh auth status
gh issue list --repo DevXT-LLC/xtsystems

# Test XTSystems API
curl -H "Authorization: Bearer $XTSYSTEMS_API_KEY" \
     $XTSYSTEMS_API_URL/v1/tickets

# Test Discord permissions
# Use /bot-status command in Discord
```

## Need Help?

1. Check the [full README](README.md)
2. Review logs in the `logs/` directory
3. Test each component individually
4. Create an issue in this repository

---

🚀 **Happy automating with XTSystems Discord Bot!**
