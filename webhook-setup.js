#!/usr/bin/env node

/**
 * XTSystems Webhook Registration Script
 * 
 * This script helps register Discord bot webhooks in XTSystems
 * Usage: node webhook-setup.js [options]
 */

const axios = require('axios');
const readline = require('readline');
require('dotenv').config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

class WebhookSetup {
    constructor() {
        this.config = {
            xtsystemsApiUrl: process.env.XTSYSTEMS_API_URL || 'http://localhost:20437',
            xtsystemsApiKey: process.env.XTSYSTEMS_API_KEY,
            webhookPort: process.env.WEBHOOK_PORT || 3000,
            webhookSecret: process.env.WEBHOOK_SECRET || 'default-secret',
            webhookPath: process.env.WEBHOOK_PATH || '/webhooks/xtsystems'
        };
    }

    async prompt(question) {
        return new Promise((resolve) => {
            rl.question(question, resolve);
        });
    }

    async registerWebhook() {
        try {
            console.log('🔗 XTSystems Webhook Setup');
            console.log('=========================\n');

            // Validate configuration
            if (!this.config.xtsystemsApiKey) {
                console.error('❌ XTSYSTEMS_API_KEY not configured in .env file');
                process.exit(1);
            }

            console.log('Current configuration:');
            console.log(`- XTSystems API URL: ${this.config.xtsystemsApiUrl}`);
            console.log(`- Webhook Port: ${this.config.webhookPort}`);
            console.log(`- Webhook Path: ${this.config.webhookPath}`);
            console.log(`- Secret: ${this.config.webhookSecret !== 'default-secret' ? '✅ Custom' : '⚠️ Default'}\n`);

            const useDefaults = await this.prompt('Use these settings? (y/n): ');

            if (useDefaults.toLowerCase() !== 'y') {
                console.log('Please update your .env file and run again.');
                rl.close();
                return;
            }

            // Get webhook URL
            const webhookUrl = await this.prompt(`Enter webhook URL (default: http://localhost:${this.config.webhookPort}${this.config.webhookPath}): `);
            const finalUrl = webhookUrl.trim() || `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`;

            // Select events
            console.log('\nAvailable events:');
            const availableEvents = [
                'ticket.created',
                'ticket.updated',
                'ticket.closed',
                'asset.created',
                'asset.updated',
                'user.created',
                'company.created',
                'machine.registered',
                'machine.approved',
                'alert.triggered'
            ];

            availableEvents.forEach((event, index) => {
                console.log(`${index + 1}. ${event}`);
            });

            const eventSelection = await this.prompt('\nSelect events (comma-separated numbers, or "all"): ');

            let selectedEvents;
            if (eventSelection.toLowerCase() === 'all') {
                selectedEvents = availableEvents;
            } else {
                const indices = eventSelection.split(',').map(s => parseInt(s.trim()) - 1);
                selectedEvents = indices.map(i => availableEvents[i]).filter(Boolean);
            }

            console.log(`\nSelected events: ${selectedEvents.join(', ')}\n`);

            // Create webhook
            const webhookData = {
                name: 'Discord Bot Integration',
                url: finalUrl,
                events: selectedEvents,
                secret: this.config.webhookSecret,
                active: true,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'XTSystems-Discord-Bot/1.0'
                }
            };

            console.log('Creating webhook in XTSystems...');

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

            console.log('✅ Webhook created successfully!');
            console.log(`Webhook ID: ${response.data.id}`);
            console.log(`URL: ${finalUrl}`);
            console.log(`Events: ${selectedEvents.join(', ')}`);

            // Test webhook
            const testWebhook = await this.prompt('\nTest webhook now? (y/n): ');
            if (testWebhook.toLowerCase() === 'y') {
                await this.testWebhook(response.data.id);
            }

        } catch (error) {
            console.error('❌ Error creating webhook:', error.response?.data || error.message);
        } finally {
            rl.close();
        }
    }

    async testWebhook(webhookId) {
        try {
            console.log('Sending test webhook...');

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
                console.log('✅ Test webhook sent successfully!');
            } else {
                console.log('⚠️ Test webhook sent but may have failed delivery');
            }
        } catch (error) {
            console.error('❌ Error testing webhook:', error.response?.data || error.message);
        }
    }

    async listWebhooks() {
        try {
            const response = await axios.get(
                `${this.config.xtsystemsApiUrl}/v1/webhooks`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('📋 Existing Webhooks:');
            console.log('====================\n');

            if (response.data.length === 0) {
                console.log('No webhooks found.');
            } else {
                response.data.forEach((webhook, index) => {
                    console.log(`${index + 1}. ${webhook.name}`);
                    console.log(`   ID: ${webhook.id}`);
                    console.log(`   URL: ${webhook.url}`);
                    console.log(`   Events: ${webhook.events.join(', ')}`);
                    console.log(`   Active: ${webhook.active ? '✅' : '❌'}`);
                    console.log(`   Created: ${webhook.created_at}\n`);
                });
            }
        } catch (error) {
            console.error('❌ Error listing webhooks:', error.response?.data || error.message);
        } finally {
            rl.close();
        }
    }

    async deleteWebhook() {
        try {
            await this.listWebhooks();
            rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const webhookId = await this.prompt('Enter webhook ID to delete: ');

            if (!webhookId) {
                console.log('No webhook ID provided.');
                return;
            }

            const confirm = await this.prompt(`Are you sure you want to delete webhook ${webhookId}? (y/n): `);
            if (confirm.toLowerCase() !== 'y') {
                console.log('Operation cancelled.');
                return;
            }

            await axios.delete(
                `${this.config.xtsystemsApiUrl}/v1/webhooks/${webhookId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Webhook deleted successfully!');
        } catch (error) {
            console.error('❌ Error deleting webhook:', error.response?.data || error.message);
        } finally {
            rl.close();
        }
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'register';

    const setup = new WebhookSetup();

    switch (command) {
        case 'register':
        case 'create':
            await setup.registerWebhook();
            break;
        case 'list':
            await setup.listWebhooks();
            break;
        case 'delete':
            await setup.deleteWebhook();
            break;
        case 'help':
        default:
            console.log('XTSystems Webhook Setup Script');
            console.log('==============================\n');
            console.log('Commands:');
            console.log('  register  - Register a new webhook (default)');
            console.log('  list      - List existing webhooks');
            console.log('  delete    - Delete a webhook');
            console.log('  help      - Show this help message\n');
            console.log('Examples:');
            console.log('  node webhook-setup.js register');
            console.log('  node webhook-setup.js list');
            console.log('  node webhook-setup.js delete');
            break;
    }
}

main().catch(console.error);
