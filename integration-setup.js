#!/usr/bin/env node

/**
 * XTSystems + Discord Bot Integration Setup Script
 * 
 * This script automates the setup process for integrating the Discord bot
 * with the newly implemented XTSystems webhook system.
 */

const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

class IntegrationSetup {
    constructor() {
        this.config = {
            xtsystemsApiUrl: process.env.XTSYSTEMS_API_URL || 'http://localhost:20437',
            xtsystemsApiKey: process.env.XTSYSTEMS_API_KEY,
            webhookPort: process.env.WEBHOOK_PORT || 3000,
            webhookSecret: process.env.WEBHOOK_SECRET || this.generateSecret(),
            webhookPath: process.env.WEBHOOK_PATH || '/webhooks/xtsystems',
            discordToken: process.env.DISCORD_TOKEN,
            discordClientId: process.env.DISCORD_CLIENT_ID,
            discordGuildId: process.env.DISCORD_GUILD_ID
        };
    }

    generateSecret() {
        return require('crypto').randomBytes(32).toString('hex');
    }

    async prompt(question) {
        return new Promise((resolve) => {
            rl.question(question, resolve);
        });
    }

    async checkXTSystemsConnection() {
        console.log('🔍 Checking XTSystems connection...');

        try {
            const response = await axios.get(`${this.config.xtsystemsApiUrl}/health`, {
                timeout: 5000
            });

            if (response.status === 200) {
                console.log('✅ XTSystems is running and accessible');
                return true;
            }
        } catch (error) {
            console.error('❌ Failed to connect to XTSystems:');
            console.error(`   URL: ${this.config.xtsystemsApiUrl}`);
            console.error(`   Error: ${error.message}`);
            return false;
        }
    }

    async checkApiKey() {
        console.log('🔑 Validating XTSystems API key...');

        if (!this.config.xtsystemsApiKey) {
            console.error('❌ XTSYSTEMS_API_KEY not configured');
            return false;
        }

        try {
            const response = await axios.get(`${this.config.xtsystemsApiUrl}/v1/webhooks`, {
                headers: {
                    'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            console.log('✅ API key is valid');
            console.log(`   Found ${response.data.length} existing webhooks`);
            return true;
        } catch (error) {
            console.error('❌ API key validation failed:');
            console.error(`   Status: ${error.response?.status || 'Network Error'}`);
            console.error(`   Error: ${error.response?.data?.detail || error.message}`);
            return false;
        }
    }

    async registerDiscordWebhook() {
        console.log('🔗 Registering Discord bot webhook in XTSystems...');

        const webhookUrl = `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`;

        const webhookData = {
            name: 'Discord Bot Integration',
            url: webhookUrl,
            events: [
                'ticket.created',
                'ticket.updated',
                'ticket.closed',
                'asset.created',
                'asset.updated',
                'machine.registered',
                'machine.approved',
                'alert.triggered'
            ],
            secret: this.config.webhookSecret,
            active: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'XTSystems-Discord-Bot/1.0'
            }
        };

        try {
            const response = await axios.post(
                `${this.config.xtsystemsApiUrl}/v1/webhooks`,
                webhookData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Discord webhook registered successfully!');
            console.log(`   Webhook ID: ${response.data.id}`);
            console.log(`   URL: ${webhookUrl}`);
            console.log(`   Events: ${webhookData.events.join(', ')}`);

            return response.data;
        } catch (error) {
            console.error('❌ Failed to register webhook:');
            console.error(`   Error: ${error.response?.data?.detail || error.message}`);
            return null;
        }
    }

    async testWebhookEndpoint(webhookId) {
        console.log('🧪 Testing webhook endpoint...');

        try {
            const response = await axios.post(
                `${this.config.xtsystemsApiUrl}/v1/webhooks/${webhookId}/test`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.success) {
                console.log('✅ Webhook test successful!');
                return true;
            } else {
                console.log('⚠️ Webhook test completed but delivery may have failed');
                return false;
            }
        } catch (error) {
            console.error('❌ Webhook test failed:');
            console.error(`   Error: ${error.response?.data?.detail || error.message}`);
            return false;
        }
    }

    async updateEnvFile() {
        console.log('📝 Updating .env file...');

        const envPath = path.join(__dirname, '.env');
        let envContent = '';

        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        }

        // Update or add configuration values
        const updateEnvVar = (key, value) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const newLine = `${key}=${value}`;

            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, newLine);
            } else {
                envContent += `\\n${newLine}`;
            }
        };

        updateEnvVar('WEBHOOK_SECRET', this.config.webhookSecret);
        updateEnvVar('WEBHOOK_PORT', this.config.webhookPort);
        updateEnvVar('WEBHOOK_PATH', this.config.webhookPath);
        updateEnvVar('XTSYSTEMS_API_URL', this.config.xtsystemsApiUrl);

        if (this.config.xtsystemsApiKey) {
            updateEnvVar('XTSYSTEMS_API_KEY', this.config.xtsystemsApiKey);
        }

        fs.writeFileSync(envPath, envContent.trim() + '\\n');
        console.log('✅ .env file updated');
    }

    async showSummary(webhookData) {
        console.log('\\n🎉 Integration Setup Complete!');
        console.log('================================\\n');

        console.log('XTSystems Configuration:');
        console.log(`  - API URL: ${this.config.xtsystemsApiUrl}`);
        console.log(`  - Webhook ID: ${webhookData?.id || 'Not registered'}`);
        console.log(`  - Events: ${webhookData?.events?.join(', ') || 'None'}`);

        console.log('\\nDiscord Bot Configuration:');
        console.log(`  - Webhook Port: ${this.config.webhookPort}`);
        console.log(`  - Webhook Path: ${this.config.webhookPath}`);
        console.log(`  - Secret: ${this.config.webhookSecret ? '✅ Configured' : '❌ Not set'}`);

        console.log('\\nNext Steps:');
        console.log('1. Ensure your Discord bot token is configured in .env');
        console.log('2. Start the Discord bot: npm start');
        console.log('3. Test the integration by creating a ticket in XTSystems');
        console.log('4. Check Discord channels for webhook notifications');
        console.log('\\nFor testing: Use the Discord slash commands:');
        console.log('  - /webhook-status - Check webhook server status');
        console.log('  - /test-webhook - Send a test webhook');
        console.log('  - /webhook-config - View webhook configuration');
    }

    async run() {
        console.log('🚀 XTSystems + Discord Bot Integration Setup');
        console.log('===========================================\\n');

        // Step 1: Check XTSystems connection
        const xtsystemsOnline = await this.checkXTSystemsConnection();
        if (!xtsystemsOnline) {
            console.log('\\n❌ Setup aborted. Please ensure XTSystems is running and try again.');
            process.exit(1);
        }

        // Step 2: Validate API key
        const apiKeyValid = await this.checkApiKey();
        if (!apiKeyValid) {
            console.log('\\n❌ Setup aborted. Please configure a valid XTSYSTEMS_API_KEY and try again.');
            process.exit(1);
        }

        // Step 3: Register webhook
        const webhookData = await this.registerDiscordWebhook();
        if (!webhookData) {
            console.log('\\n❌ Setup aborted. Failed to register webhook.');
            process.exit(1);
        }

        // Step 4: Update .env file
        await this.updateEnvFile();

        // Step 5: Test webhook (optional)
        const testWebhook = await this.prompt('\\nTest webhook endpoint now? (y/n): ');
        if (testWebhook.toLowerCase() === 'y') {
            await this.testWebhookEndpoint(webhookData.id);
        }

        // Step 6: Show summary
        await this.showSummary(webhookData);

        rl.close();
    }
}

// Run the setup
const setup = new IntegrationSetup();
setup.run().catch(error => {
    console.error('\\n❌ Setup failed with error:', error.message);
    process.exit(1);
});
