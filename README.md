# XTSystems Discord Bot

A sophisticated Discord bot that integrates with XTSystems and AGiXT to provide intelligent GitHub issue management and automated conversation analysis.

## Features

### ### 🎫 XTSystems Integration

Direct API integration with XTSystems provides:
- Ticket creation and management
- Company-based multi-tenancy
- Asset association (when configured)
- Status tracking and updates
- **Webhook Reception**: Receives real-time notifications from XTSystems
- **Interactive Actions**: Approve/deny machine registrations via Discord

**Webhook Events:**
- `ticket.created` - New ticket notifications
- `ticket.updated` - Ticket status changes
- `ticket.closed` - Ticket resolution
- `asset.created` - New asset registrations
- `machine.registered` - Machine approval requests
- `alert.triggered` - System alerts and monitoring

**Ticket Types:**
- Configurable ticket types
- Automatic priority assignment
- User attribution from Discord Analysis
- **AGiXT Integration**: Uses AGiXT for intelligent conversation analysis
- **Context-Aware**: Analyzes conversation context to determine if issues or features should be created
- **Confidence Scoring**: Only suggests actions when confidence is above threshold
- **Fallback Analysis**: Simple keyword analysis when AI is unavailable

### 📋 GitHub Integration
- **Automatic Issue Creation**: Monitors conversations and suggests creating GitHub issues
- **Manual Issue Management**: Create, list, and close issues via Discord commands
- **Smart Categorization**: Automatically assigns labels and priorities
- **Repository Linking**: Link Discord channels to specific GitHub repositories

### 🎫 XTSystems Integration
- **Ticket Creation**: Create tickets directly in XTSystems from Discord
- **Multi-tenant Support**: Works with XTSystems' company-based structure
- **Priority Management**: Set ticket priorities and track status

### 💬 Discord Features
- **Slash Commands**: Modern Discord slash command interface
- **Interactive Buttons**: Approve/reject suggestions with buttons
- **Rich Embeds**: Beautiful, informative message embeds
- **Channel Monitoring**: Monitor specific channels for automatic analysis
- **Conversation History**: Maintains context for better analysis

## Prerequisites

- Node.js 18.0.0 or higher
- Discord Bot Token
- GitHub CLI with authentication
- XTSystems API access
- AGiXT API access (optional, but recommended for AI features)

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Nick-XT/AGiXT_Discord.git
   cd AGiXT_Discord
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up GitHub CLI:**
   ```bash
   gh auth login
   ```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_TOKEN` | Discord bot token | ✅ |
| `DISCORD_CLIENT_ID` | Discord application client ID | ✅ |
| `DISCORD_GUILD_ID` | Discord server (guild) ID | ✅ |
| `GITHUB_TOKEN` | GitHub personal access token | ✅ |
| `REPO_OWNER` | Default GitHub repository owner | ✅ |
| `REPO_NAME` | Default GitHub repository name | ✅ |
| `XTSYSTEMS_API_URL` | XTSystems API base URL | ✅ |
| `XTSYSTEMS_API_KEY` | XTSystems API key | ✅ |
| `AGIXT_API_URL` | AGiXT API base URL | ⚠️ |
| `AGIXT_API_KEY` | AGiXT API key | ⚠️ |
| `WEBHOOK_PORT` | Port for webhook server | ❌ |
| `WEBHOOK_SECRET` | Secret for webhook signature verification | ⚠️ |
| `WEBHOOK_PATH` | Webhook endpoint path | ❌ |
| `DISCORD_WEBHOOK_CHANNELS` | JSON mapping of events to channel IDs | ❌ |
| `MONITOR_CHANNELS` | Comma-separated channel IDs to monitor | ❌ |
| `AUTO_CREATE_ISSUES` | Enable automatic issue creation (true/false) | ❌ |
| `ANALYSIS_THRESHOLD` | Number of messages to analyze for context | ❌ |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | ❌ |

### Discord Bot Setup

1. **Create a Discord Application:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to "Bot" section and create a bot
   - Copy the token to `DISCORD_TOKEN`

2. **Get Application ID:**
   - Copy the Application ID from the General Information tab to `DISCORD_CLIENT_ID`

3. **Invite Bot to Server:**
   - Go to OAuth2 > URL Generator
   - Select "bot" and "applications.commands" scopes
   - Select necessary permissions:
     - Send Messages
     - Use Slash Commands
     - Read Message History
     - Embed Links
     - Add Reactions
   - Use the generated URL to invite the bot

4. **Get Guild ID:**
   - Enable Developer Mode in Discord
   - Right-click your server and "Copy ID"
   - Set this as `DISCORD_GUILD_ID`

### XTSystems Setup

1. **Get API Access:**
   - Ensure XTSystems is running and accessible
   - Create an API key in XTSystems
   - Set the API URL and key in environment variables

2. **Configure Ticket Types (Optional):**
   - Set up default ticket types in XTSystems
   - Update the bot code to use specific ticket type IDs

### AGiXT Setup (Optional but Recommended)

1. **Install AGiXT:**
   - Follow AGiXT installation instructions
   - Ensure the API is accessible

2. **Create Agent:**
   - Create an agent named "XTSystems-Analyzer" or update the bot code
   - Configure the agent for conversation analysis

## Usage

### Running the Bot

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

### Slash Commands

| Command | Description | Options |
|---------|-------------|---------|
| `/create-issue` | Create a GitHub issue | title, description, type, priority |
| `/create-ticket` | Create an XTSystems ticket | title, description, priority |
| `/list-issues` | List recent GitHub issues | limit |
| `/close-issue` | Close a GitHub issue | number, comment |
| `/analyze-conversation` | Analyze recent conversation | messages |
| `/toggle-monitoring` | Enable/disable monitoring for channel | none |
| `/link-repo` | Link channel to GitHub repository | owner, repo |
| `/bot-status` | Check bot status and configuration | none |
| `/webhook-status` | Check webhook server status | none |
| `/register-webhook` | Register bot as webhook in XTSystems | events |
| `/test-webhook` | Test webhook connectivity | none |
| `/webhook-config` | Show webhook configuration | none |

### Direct Commands

- `@BotName help` or `!xt help` - Show help message
- `@BotName status` or `!xt status` - Quick status check

### Automatic Features

1. **Conversation Monitoring:**
   - Bot monitors configured channels
   - Analyzes messages for potential issues/features
   - Suggests creating GitHub issues or XTSystems tickets

2. **AI Analysis:**
   - Uses AGiXT to understand conversation context
   - Determines if discussion indicates a bug, feature request, or general chat
   - Provides confidence scores and reasoning

3. **Interactive Suggestions:**
   - Presents suggestions with approve/ignore buttons
   - Creates issues/tickets when approved
   - Updates original messages with results

## Integration Details

### GitHub Integration

The bot integrates with GitHub through the GitHub CLI (`gh`), which provides:
- Authenticated access to repositories
- Issue creation, listing, and management
- Automatic labeling and priority assignment
- Comments and status updates

**Supported Labels:**
- `bug` - For bug reports
- `enhancement` - For feature requests
- `documentation` - For documentation issues
- `question` - For questions
- Priority labels (if configured)

### XTSystems Integration

Direct API integration with XTSystems provides:
- Ticket creation and management
- Company-based multi-tenancy
- Asset association (when configured)
- Status tracking and updates

**Ticket Types:**
- Configurable ticket types
- Automatic priority assignment
- User attribution from Discord

### AGiXT Integration

AI-powered conversation analysis using AGiXT:
- Context-aware issue detection
- Natural language understanding
- Confidence scoring for suggestions
- Reasoning explanations for decisions

**Analysis Criteria:**
- Bug indicators: "not working", "error", "broken", "crash"
- Feature indicators: "would be nice", "suggest", "add", "implement"
- Context analysis for better understanding
- Minimum confidence threshold (70% default)

## Architecture

```
Discord Channel → Bot Message Handler → AI Analysis (AGiXT) → Action Decision
                                    ↓
GitHub CLI ← Issue Creation ← Suggestion with Buttons → User Approval
                                    ↓
XTSystems API ← Ticket Creation ← User Interaction → Ticket Management
```

### Key Components

1. **Message Handler**: Processes Discord messages and maintains conversation history
2. **AI Analyzer**: Sends conversation context to AGiXT for analysis
3. **Issue Manager**: Handles GitHub issue creation and management via CLI
4. **Ticket Manager**: Manages XTSystems tickets via API
5. **Command Handler**: Processes slash commands and interactions
6. **Configuration Manager**: Handles environment and runtime configuration

## Security Considerations

- **API Keys**: Store securely, never commit to version control
- **Permissions**: Grant minimal necessary Discord permissions
- **Rate Limiting**: Respect API rate limits for all integrations
- **Input Validation**: All user inputs are validated and sanitized
- **Error Handling**: Comprehensive error handling prevents crashes

## Troubleshooting

### Common Issues

1. **Bot not responding:**
   - Check Discord token and permissions
   - Verify bot is invited to the server
   - Check console logs for errors

2. **GitHub integration not working:**
   - Verify GitHub CLI authentication: `gh auth status`
   - Check repository permissions
   - Verify GITHUB_TOKEN is set correctly

3. **XTSystems integration failing:**
   - Check XTSystems API URL and key
   - Verify XTSystems is running and accessible
   - Check API endpoints and authentication

4. **AGiXT analysis not working:**
   - Verify AGiXT API URL and key
   - Check if AGiXT agent exists
   - Bot will fall back to keyword analysis

### Debugging

1. **Enable debug logging:**
   ```bash
   LOG_LEVEL=debug npm start
   ```

2. **Check logs:**
   ```bash
   tail -f logs/combined.log
   tail -f logs/error.log
   ```

3. **Test components individually:**
   - Use `/bot-status` command to check configuration
   - Test GitHub CLI manually: `gh issue list`
   - Test XTSystems API with curl or Postman

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support and questions:
- Create an issue in this repository
- Check the XTSystems documentation
- Refer to AGiXT documentation for AI integration

## Roadmap

- [ ] Dashboard web interface
- [ ] Advanced AI analysis models
- [ ] Multi-repository support per channel
- [ ] Custom workflow automation
- [ ] Integration with more ticketing systems
- [ ] Advanced reporting and analytics
- [ ] Voice channel monitoring
- [ ] Automated testing and CI/CD

---

*Built with ❤️ for the XTSystems and AGiXT communities*
