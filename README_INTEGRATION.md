# XTSystems + Discord Bot Webhook Integration

This repository contains a Discord bot that integrates with the XTSystems platform through a comprehensive webhook system. The bot receives real-time notifications from XTSystems and displays them in Discord channels.

## 🚀 Features

### Real-time Notifications
- **Ticket Events**: New tickets, updates, and closures
- **Asset Management**: Asset creation and updates
- **Machine Management**: Device registration and approval requests
- **System Alerts**: Critical system notifications

### Interactive Features
- **Machine Approval**: Approve/deny machine registrations directly from Discord
- **Ticket Management**: Quick ticket actions and status updates
- **Webhook Management**: Test, configure, and monitor webhooks

### Security
- **HMAC Signature Verification**: All webhook payloads are cryptographically signed
- **Timestamp Validation**: Prevents replay attacks
- **Rate Limiting**: Protection against abuse
- **Secret Management**: Secure webhook secret handling

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **XTSystems** platform running and accessible
- **Discord Bot Token** and permissions
- **API Key** for XTSystems

## ⚡ Quick Setup

### 1. Clone and Install
```bash
git clone <repository-url>
cd AGiXT_Discord
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Run Integration Setup
```bash
node integration-setup.js
```

This automated setup script will:
- ✅ Verify XTSystems connection
- ✅ Validate API credentials
- ✅ Register Discord webhook in XTSystems
- ✅ Configure webhook settings
- ✅ Test the integration

### 4. Start the Bot
```bash
npm start
```

## 🔧 Manual Configuration

If you prefer manual setup, follow these steps:

### Environment Variables
Create a `.env` file with the following configuration:

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_GUILD_ID=your_discord_guild_id_here

# XTSystems API Configuration
XTSYSTEMS_API_URL=http://localhost:20437
XTSYSTEMS_API_KEY=your_xtsystems_api_key_here

# Webhook Configuration
WEBHOOK_PORT=3000
WEBHOOK_SECRET=your_secure_webhook_secret_here
WEBHOOK_PATH=/webhooks/xtsystems

# Discord Channel Configuration
DISCORD_WEBHOOK_CHANNELS={"ticket.created":["CHANNEL_ID"],"machine.registered":["CHANNEL_ID"],"default":["CHANNEL_ID"]}
```

### Register Webhook in XTSystems
```bash
# Using the webhook setup script
node webhook-setup.js register

# Or manually via API
curl -X POST "http://localhost:20437/v1/webhooks" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Discord Bot Integration",
    "url": "http://localhost:3000/webhooks/xtsystems",
    "events": ["ticket.created", "ticket.updated", "machine.registered"],
    "secret": "your_webhook_secret"
  }'
```

## 🎯 XTSystems Webhook Implementation

The integration includes a complete webhook system implemented in XTSystems:

### Database Schema
- **webhooks table**: Stores webhook configurations
- **webhook_deliveries table**: Tracks delivery attempts and responses

### API Endpoints
- `GET /v1/webhooks` - List webhooks
- `POST /v1/webhooks` - Create webhook
- `PUT /v1/webhooks/{id}` - Update webhook
- `DELETE /v1/webhooks/{id}` - Delete webhook
- `POST /v1/webhooks/{id}/test` - Test webhook delivery
- `GET /v1/webhooks/{id}/deliveries` - View delivery history

### Event Triggers
Webhooks are automatically triggered for:
- **ticket.created** - New ticket creation
- **ticket.updated** - Ticket modifications
- **ticket.closed** - Ticket closure
- **asset.created** - New asset registration
- **asset.updated** - Asset modifications
- **machine.registered** - New machine registration
- **machine.approved** - Machine approval
- **alert.triggered** - System alerts

## 🎮 Discord Bot Commands

### Webhook Management
- `/webhook-status` - Check webhook server status
- `/webhook-config` - View webhook configuration
- `/register-webhook` - Register bot as webhook in XTSystems
- `/test-webhook` - Send test webhook

### Machine Management
- Approve/Deny buttons on machine registration notifications
- Interactive machine status updates

## 📊 Event Types & Notifications

### Ticket Events
```json
{
  "event_type": "ticket.created",
  "data": {
    "id": "ticket-uuid",
    "seq_id": 1001,
    "title": "Network Issue",
    "status": "open",
    "priority": "high",
    "created_by": "user@example.com",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### Machine Events
```json
{
  "event_type": "machine.registered",
  "data": {
    "asset_id": "asset-uuid",
    "hostname": "DESKTOP-001",
    "ip_address": "192.168.1.100",
    "status": "pending",
    "registered_at": "2024-01-15T10:30:00Z"
  }
}
```

### Asset Events
```json
{
  "event_type": "asset.created",
  "data": {
    "id": "asset-uuid",
    "name": "Server-001",
    "description": "Production web server",
    "created_by": "admin@example.com",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

## 🔐 Security Features

### Webhook Signature Verification
All webhook payloads include HMAC-SHA256 signatures:
```
X-XTSystems-Signature: sha256=<signature>
X-XTSystems-Timestamp: <unix_timestamp>
```

### Replay Attack Prevention
- Timestamps are validated (5-minute window)
- Signatures include timestamp in HMAC calculation

### Rate Limiting
- Express rate limiter protects webhook endpoints
- 100 requests per 15-minute window per IP

## 🛠️ Troubleshooting

### Common Issues

#### Webhook Not Receiving Events
1. Check XTSystems webhook configuration
2. Verify webhook URL is accessible
3. Check firewall and network settings
4. Review webhook delivery logs

#### Authentication Errors
1. Verify API key is correct and active
2. Check webhook secret matches configuration
3. Ensure proper headers are being sent

#### Discord Bot Not Responding
1. Verify Discord token is valid
2. Check bot permissions in Discord server
3. Ensure bot is invited to the correct server

### Debug Commands
```bash
# Test XTSystems connection
curl http://localhost:20437/health

# List existing webhooks
curl -H "Authorization: Bearer YOUR_API_KEY" \\
     http://localhost:20437/v1/webhooks

# Test webhook endpoint
curl -X POST http://localhost:3000/health
```

### Logs
Check these log files for debugging:
- `logs/combined.log` - All bot activity
- `logs/error.log` - Error messages only

## 📚 API Documentation

### XTSystems Webhook API

#### Create Webhook
```http
POST /v1/webhooks
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "name": "Discord Integration",
  "url": "http://localhost:3000/webhooks/xtsystems",
  "events": ["ticket.created", "ticket.updated"],
  "secret": "webhook_secret",
  "active": true
}
```

#### List Webhooks
```http
GET /v1/webhooks
Authorization: Bearer <api_key>
```

#### Test Webhook
```http
POST /v1/webhooks/{webhook_id}/test
Authorization: Bearer <api_key>
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in this repository
- Check the troubleshooting section above
- Review the XTSystems documentation

## 🔄 Updates

### Recent Changes
- ✅ Complete webhook system implementation in XTSystems
- ✅ Real-time event notifications
- ✅ Interactive machine approval
- ✅ Comprehensive error handling
- ✅ Security improvements

### Roadmap
- 🔄 Advanced notification filtering
- 🔄 Custom notification templates
- 🔄 Multi-server support
- 🔄 Webhook analytics dashboard
