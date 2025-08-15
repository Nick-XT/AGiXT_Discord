#!/usr/bin/env node

/**
 * XTSystems Webhook Integration Test Suite
 * 
 * This script tests the entire webhook pipeline from XTSystems to Discord
 */

const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

class WebhookTester {
    constructor() {
        this.config = {
            xtsystemsApiUrl: process.env.XTSYSTEMS_API_URL || 'http://localhost:20437',
            xtsystemsApiKey: process.env.XTSYSTEMS_API_KEY,
            webhookPort: process.env.WEBHOOK_PORT || 3000,
            webhookSecret: process.env.WEBHOOK_SECRET,
            webhookPath: process.env.WEBHOOK_PATH || '/webhooks/xtsystems'
        };
    }

    async testXTSystemsHealth() {
        console.log('🔍 Testing XTSystems health...');
        try {
            const response = await axios.get(`${this.config.xtsystemsApiUrl}/health`);
            console.log('✅ XTSystems is healthy');
            return true;
        } catch (error) {
            console.error('❌ XTSystems health check failed:', error.message);
            return false;
        }
    }

    async testWebhookEndpoints() {
        console.log('🔍 Testing webhook endpoints...');

        if (!this.config.xtsystemsApiKey) {
            console.error('❌ No API key configured');
            return false;
        }

        try {
            // Test listing webhooks
            const response = await axios.get(`${this.config.xtsystemsApiUrl}/v1/webhooks`, {
                headers: {
                    'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`✅ Webhook endpoints accessible (${response.data.length} webhooks found)`);
            return response.data;
        } catch (error) {
            console.error('❌ Webhook endpoint test failed:', error.response?.data || error.message);
            return false;
        }
    }

    async testDiscordBotHealth() {
        console.log('🔍 Testing Discord bot health...');
        try {
            const response = await axios.get(`http://localhost:${this.config.webhookPort}/health`);
            console.log('✅ Discord bot webhook server is healthy');
            return true;
        } catch (error) {
            console.error('❌ Discord bot health check failed:', error.message);
            console.log('💡 Make sure the Discord bot is running (npm start)');
            return false;
        }
    }

    generateWebhookSignature(payload, timestamp) {
        const body = JSON.stringify(payload);
        const signature = crypto
            .createHmac('sha256', this.config.webhookSecret)
            .update(timestamp + body)
            .digest('hex');
        return `sha256=${signature}`;
    }

    async testWebhookDelivery() {
        console.log('🔍 Testing webhook delivery...');

        if (!this.config.webhookSecret) {
            console.error('❌ No webhook secret configured');
            return false;
        }

        const testPayload = {
            event_type: 'webhook.test',
            data: {
                message: 'Test webhook from integration test suite',
                timestamp: new Date().toISOString(),
                test: true
            },
            company_id: 'test-company',
            timestamp: Math.floor(Date.now() / 1000)
        };

        const timestamp = testPayload.timestamp.toString();
        const signature = this.generateWebhookSignature(testPayload, timestamp);

        try {
            const response = await axios.post(
                `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`,
                testPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-XTSystems-Signature': signature,
                        'X-XTSystems-Timestamp': timestamp,
                        'User-Agent': 'XTSystems-Webhook-Test/1.0'
                    }
                }
            );

            if (response.status === 200) {
                console.log('✅ Webhook delivery test successful');
                return true;
            } else {
                console.error(`❌ Webhook delivery failed with status: ${response.status}`);
                return false;
            }
        } catch (error) {
            console.error('❌ Webhook delivery test failed:', error.message);
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Data: ${JSON.stringify(error.response.data)}`);
            }
            return false;
        }
    }

    async testWebhookSignatureValidation() {
        console.log('🔍 Testing webhook signature validation...');

        const testPayload = {
            event_type: 'security.test',
            data: { message: 'Testing signature validation' },
            company_id: 'test-company',
            timestamp: Math.floor(Date.now() / 1000)
        };

        try {
            // Test with invalid signature
            const response = await axios.post(
                `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`,
                testPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-XTSystems-Signature': 'sha256=invalid_signature',
                        'X-XTSystems-Timestamp': testPayload.timestamp.toString(),
                        'User-Agent': 'XTSystems-Webhook-Test/1.0'
                    }
                }
            );

            console.error('❌ Signature validation test failed - invalid signature was accepted');
            return false;
        } catch (error) {
            if (error.response && error.response.status === 401) {
                console.log('✅ Signature validation working correctly');
                return true;
            } else {
                console.error('❌ Unexpected error during signature validation test:', error.message);
                return false;
            }
        }
    }

    async createTestWebhook() {
        console.log('🔍 Creating test webhook...');

        const webhookData = {
            name: 'Integration Test Webhook',
            url: `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`,
            events: ['webhook.test', 'ticket.created', 'machine.registered'],
            secret: this.config.webhookSecret,
            active: true,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'XTSystems-Integration-Test/1.0'
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

            console.log(`✅ Test webhook created with ID: ${response.data.id}`);
            return response.data;
        } catch (error) {
            if (error.response?.status === 400 && error.response?.data?.detail?.includes('already exists')) {
                console.log('ℹ️ Test webhook already exists');
                return { id: 'existing' };
            }
            console.error('❌ Failed to create test webhook:', error.response?.data || error.message);
            return null;
        }
    }

    async testXTSystemsWebhookTrigger(webhookId) {
        console.log('🔍 Testing XTSystems webhook trigger...');

        if (webhookId === 'existing') {
            console.log('ℹ️ Skipping test trigger for existing webhook');
            return true;
        }

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
                console.log('✅ XTSystems webhook trigger test successful');
                return true;
            } else {
                console.error('❌ XTSystems webhook trigger test failed');
                return false;
            }
        } catch (error) {
            console.error('❌ XTSystems webhook trigger test failed:', error.response?.data || error.message);
            return false;
        }
    }

    async runFullTest() {
        console.log('🧪 XTSystems + Discord Bot Integration Test Suite');
        console.log('================================================\\n');

        const results = {
            xtsystemsHealth: false,
            webhookEndpoints: false,
            discordBotHealth: false,
            webhookDelivery: false,
            signatureValidation: false,
            testWebhookCreation: false,
            xtsystemsTrigger: false
        };

        // Test 1: XTSystems Health
        results.xtsystemsHealth = await this.testXTSystemsHealth();

        // Test 2: Webhook Endpoints
        const webhooks = await this.testWebhookEndpoints();
        results.webhookEndpoints = !!webhooks;

        // Test 3: Discord Bot Health
        results.discordBotHealth = await this.testDiscordBotHealth();

        // Test 4: Webhook Delivery
        if (results.discordBotHealth) {
            results.webhookDelivery = await this.testWebhookDelivery();
            results.signatureValidation = await this.testWebhookSignatureValidation();
        }

        // Test 5: Create Test Webhook
        if (results.webhookEndpoints) {
            const testWebhook = await this.createTestWebhook();
            results.testWebhookCreation = !!testWebhook;

            // Test 6: XTSystems Webhook Trigger
            if (testWebhook && results.discordBotHealth) {
                results.xtsystemsTrigger = await this.testXTSystemsWebhookTrigger(testWebhook.id);
            }
        }

        // Summary
        console.log('\\n📊 Test Results Summary');
        console.log('========================');

        Object.entries(results).forEach(([test, passed]) => {
            const icon = passed ? '✅' : '❌';
            const name = test.replace(/([A-Z])/g, ' $1').toLowerCase();
            console.log(`${icon} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
        });

        const totalTests = Object.keys(results).length;
        const passedTests = Object.values(results).filter(Boolean).length;

        console.log(`\\n📈 Overall: ${passedTests}/${totalTests} tests passed`);

        if (passedTests === totalTests) {
            console.log('\\n🎉 All tests passed! Integration is working correctly.');
        } else {
            console.log('\\n⚠️  Some tests failed. Check the errors above and your configuration.');
        }

        console.log('\\n💡 Next Steps:');
        console.log('- Create a ticket in XTSystems to test real webhook delivery');
        console.log('- Register a machine to test machine approval workflow');
        console.log('- Check Discord channels for webhook notifications');

        return passedTests === totalTests;
    }
}

// Run the test suite
const tester = new WebhookTester();
tester.runFullTest().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('\\n💥 Test suite crashed:', error.message);
    process.exit(1);
});
