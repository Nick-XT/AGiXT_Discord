const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, SlashCommandBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const winston = require('winston');
const express = require('express');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const execAsync = util.promisify(exec);

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'xtsystems-discord-bot' },
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

class XTSystemsDiscordBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.config = {
            token: process.env.DISCORD_TOKEN,
            clientId: process.env.DISCORD_CLIENT_ID,
            guildId: process.env.DISCORD_GUILD_ID,
            xtsystemsApiUrl: process.env.XTSYSTEMS_API_URL || 'http://localhost:20437',
            xtsystemsApiKey: process.env.XTSYSTEMS_API_KEY,
            agitxtApiUrl: process.env.AGIXT_API_URL || 'http://localhost:7437',
            agitxtApiKey: process.env.AGIXT_API_KEY,
            githubToken: process.env.GITHUB_TOKEN,
            repoOwner: process.env.REPO_OWNER || 'DevXT-LLC',
            repoName: process.env.REPO_NAME || 'xtsystems',
            monitorChannels: process.env.MONITOR_CHANNELS ? process.env.MONITOR_CHANNELS.split(',') : [],
            autoCreateIssues: process.env.AUTO_CREATE_ISSUES === 'true',
            analysisThreshold: parseInt(process.env.ANALYSIS_THRESHOLD) || 3,
            webhookPort: parseInt(process.env.WEBHOOK_PORT) || 3000,
            webhookSecret: process.env.WEBHOOK_SECRET || 'default-secret',
            webhookPath: process.env.WEBHOOK_PATH || '/webhooks/xtsystems',
            discordWebhookChannels: process.env.DISCORD_WEBHOOK_CHANNELS ?
                JSON.parse(process.env.DISCORD_WEBHOOK_CHANNELS) : {}
        };

        this.conversationHistory = new Map(); // Channel ID -> Array of messages
        this.issueKeywords = [
            'bug', 'issue', 'problem', 'error', 'broken', 'not working', 'failed', 'crash', 'exception'
        ];
        this.featureKeywords = [
            'feature', 'enhancement', 'improvement', 'suggest', 'add', 'implement', 'would be nice', 'request'
        ];

        this.setupEventListeners();
        this.registerCommands();
        this.setupWebhookServer();
    }

    setupEventListeners() {
        this.client.once('ready', () => {
            logger.info(`${this.client.user.tag} is now online and monitoring channels!`);
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });

        this.client.on('interactionCreate', async (interaction) => {
            await this.handleInteraction(interaction);
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
        });
    }

    async registerCommands() {
        const commands = [
            new SlashCommandBuilder()
                .setName('create-issue')
                .setDescription('Manually create a GitHub issue')
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Issue title')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Issue description')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Issue type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Bug', value: 'bug' },
                            { name: 'Feature Request', value: 'enhancement' },
                            { name: 'Documentation', value: 'documentation' },
                            { name: 'Question', value: 'question' }
                        ))
                .addStringOption(option =>
                    option.setName('priority')
                        .setDescription('Issue priority')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Low', value: 'low' },
                            { name: 'Medium', value: 'medium' },
                            { name: 'High', value: 'high' },
                            { name: 'Critical', value: 'critical' }
                        )),

            new SlashCommandBuilder()
                .setName('list-issues')
                .setDescription('List recent GitHub issues')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of issues to show (default: 10)')
                        .setRequired(false)),

            new SlashCommandBuilder()
                .setName('close-issue')
                .setDescription('Close a GitHub issue')
                .addIntegerOption(option =>
                    option.setName('number')
                        .setDescription('Issue number')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('comment')
                        .setDescription('Closing comment')
                        .setRequired(false)),

            new SlashCommandBuilder()
                .setName('analyze-conversation')
                .setDescription('Analyze recent conversation for potential issues/features')
                .addIntegerOption(option =>
                    option.setName('messages')
                        .setDescription('Number of recent messages to analyze (default: 20)')
                        .setRequired(false)),

            new SlashCommandBuilder()
                .setName('toggle-monitoring')
                .setDescription('Toggle automatic issue creation for this channel'),

            new SlashCommandBuilder()
                .setName('link-repo')
                .setDescription('Link this channel to a specific GitHub repository')
                .addStringOption(option =>
                    option.setName('owner')
                        .setDescription('Repository owner')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('repo')
                        .setDescription('Repository name')
                        .setRequired(true)),

            new SlashCommandBuilder()
                .setName('bot-status')
                .setDescription('Check bot status and configuration'),

            new SlashCommandBuilder()
                .setName('create-ticket')
                .setDescription('Create a ticket in XTSystems')
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Ticket title')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Ticket description')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('priority')
                        .setDescription('Ticket priority')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Low', value: 'Low' },
                            { name: 'Medium', value: 'Medium' },
                            { name: 'High', value: 'High' },
                            { name: 'Critical', value: 'Critical' }
                        )),

            new SlashCommandBuilder()
                .setName('webhook-status')
                .setDescription('Check webhook server status and configuration'),

            new SlashCommandBuilder()
                .setName('register-webhook')
                .setDescription('Register this Discord bot as a webhook in XTSystems')
                .addStringOption(option =>
                    option.setName('events')
                        .setDescription('Comma-separated list of events (default: all)')
                        .setRequired(false)),

            new SlashCommandBuilder()
                .setName('test-webhook')
                .setDescription('Send a test webhook from XTSystems to verify connectivity'),

            new SlashCommandBuilder()
                .setName('webhook-config')
                .setDescription('Show webhook configuration and channel mappings')
        ];

        const rest = new REST({ version: '10' }).setToken(this.config.token);

        try {
            logger.info('Started refreshing application (/) commands.');
            await rest.put(
                Routes.applicationGuildCommands(this.config.clientId, this.config.guildId),
                { body: commands }
            );
            logger.info('Successfully reloaded application (/) commands.');
        } catch (error) {
            logger.error('Error registering commands:', error);
        }
    }

    async handleMessage(message) {
        if (message.author.bot) return;

        const channelId = message.channel.id;

        // Store conversation history
        if (!this.conversationHistory.has(channelId)) {
            this.conversationHistory.set(channelId, []);
        }

        const history = this.conversationHistory.get(channelId);
        history.push({
            author: message.author.username,
            content: message.content,
            timestamp: message.createdTimestamp,
            messageId: message.id
        });

        // Keep only the last 50 messages per channel
        if (history.length > 50) {
            history.shift();
        }

        // Check if this channel is being monitored
        if (this.config.monitorChannels.includes(channelId) && this.config.autoCreateIssues) {
            await this.analyzeMessageForIssues(message, history);
        }

        // Check for bot mentions or direct commands
        if (message.mentions.has(this.client.user) || message.content.startsWith('!xt')) {
            await this.handleDirectCommand(message);
        }
    }

    async analyzeMessageForIssues(message, history) {
        try {
            const recentMessages = history.slice(-this.config.analysisThreshold);
            const conversationContext = recentMessages.map(msg =>
                `${msg.author}: ${msg.content}`
            ).join('\n');

            // Use AGiXT to analyze the conversation
            const analysis = await this.analyzeWithAGiXT(conversationContext, message.content);

            if (analysis && (analysis.shouldCreateIssue || analysis.shouldCreateFeature)) {
                await this.suggestIssueCreation(message, analysis);
            }
        } catch (error) {
            logger.error('Error analyzing message for issues:', error);
        }
    }

    async analyzeWithAGiXT(conversationContext, currentMessage) {
        try {
            const prompt = `
Analyze the following Discord conversation and current message to determine if it contains:
1. A bug report or issue that should be tracked
2. A feature request or enhancement suggestion
3. General discussion that doesn't need tracking

Conversation context:
${conversationContext}

Current message: ${currentMessage}

Please respond with a JSON object containing:
{
    "shouldCreateIssue": boolean,
    "shouldCreateFeature": boolean,
    "issueType": "bug" | "enhancement" | "documentation" | "question" | null,
    "title": "suggested title" | null,
    "description": "suggested description" | null,
    "priority": "low" | "medium" | "high" | "critical" | null,
    "confidence": number (0-100),
    "reasoning": "explanation of decision"
}

Consider:
- Bug indicators: "not working", "error", "broken", "crash", "issue", "problem"
- Feature indicators: "would be nice", "suggest", "add", "implement", "feature request"
- Only suggest creation if the confidence is above 70%
`;

            const response = await axios.post(`${this.config.agitxtApiUrl}/api/v1/chat`, {
                agent_name: 'XTSystems-Analyzer',
                user_input: prompt,
                conversation_name: `discord-analysis-${Date.now()}`
            }, {
                headers: {
                    'Authorization': `Bearer ${this.config.agitxtApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.response) {
                try {
                    return JSON.parse(response.data.response);
                } catch (parseError) {
                    logger.warn('Could not parse AGiXT response as JSON:', response.data.response);
                    return null;
                }
            }
        } catch (error) {
            logger.error('Error calling AGiXT API:', error);

            // Fallback to simple keyword analysis
            return this.simpleKeywordAnalysis(currentMessage);
        }

        return null;
    }

    simpleKeywordAnalysis(message) {
        const content = message.toLowerCase();
        const hasIssueKeywords = this.issueKeywords.some(keyword => content.includes(keyword));
        const hasFeatureKeywords = this.featureKeywords.some(keyword => content.includes(keyword));

        if (hasIssueKeywords) {
            return {
                shouldCreateIssue: true,
                shouldCreateFeature: false,
                issueType: 'bug',
                title: `Bug report from Discord: ${message.substring(0, 50)}...`,
                description: message,
                priority: 'medium',
                confidence: 60,
                reasoning: 'Keyword-based analysis detected issue keywords'
            };
        }

        if (hasFeatureKeywords) {
            return {
                shouldCreateIssue: false,
                shouldCreateFeature: true,
                issueType: 'enhancement',
                title: `Feature request from Discord: ${message.substring(0, 50)}...`,
                description: message,
                priority: 'low',
                confidence: 60,
                reasoning: 'Keyword-based analysis detected feature keywords'
            };
        }

        return null;
    }

    async suggestIssueCreation(message, analysis) {
        if (analysis.confidence < 70) return;

        const embed = new EmbedBuilder()
            .setColor(analysis.shouldCreateIssue ? 0xff0000 : 0x00ff00)
            .setTitle(`🤖 Potential ${analysis.shouldCreateIssue ? 'Issue' : 'Feature'} Detected`)
            .setDescription(analysis.reasoning)
            .addFields(
                { name: 'Suggested Title', value: analysis.title || 'No title suggested', inline: false },
                { name: 'Type', value: analysis.issueType || 'Unknown', inline: true },
                { name: 'Priority', value: analysis.priority || 'Medium', inline: true },
                { name: 'Confidence', value: `${analysis.confidence}%`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems Bot', iconURL: this.client.user.displayAvatarURL() });

        const createButton = new ButtonBuilder()
            .setCustomId(`create_issue_${message.id}`)
            .setLabel('Create Issue')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝');

        const ignoreButton = new ButtonBuilder()
            .setCustomId(`ignore_suggestion_${message.id}`)
            .setLabel('Ignore')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(createButton, ignoreButton);

        await message.reply({ embeds: [embed], components: [row] });

        // Store the analysis for later use
        this.analysisCache = this.analysisCache || new Map();
        this.analysisCache.set(message.id, analysis);
    }

    async handleInteraction(interaction) {
        if (interaction.isCommand()) {
            await this.handleSlashCommand(interaction);
        } else if (interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
        }
    }

    async handleSlashCommand(interaction) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'create-issue':
                    await this.createIssueCommand(interaction);
                    break;
                case 'list-issues':
                    await this.listIssuesCommand(interaction);
                    break;
                case 'close-issue':
                    await this.closeIssueCommand(interaction);
                    break;
                case 'analyze-conversation':
                    await this.analyzeConversationCommand(interaction);
                    break;
                case 'toggle-monitoring':
                    await this.toggleMonitoringCommand(interaction);
                    break;
                case 'link-repo':
                    await this.linkRepoCommand(interaction);
                    break;
                case 'bot-status':
                    await this.botStatusCommand(interaction);
                    break;
                case 'create-ticket':
                    await this.createTicketCommand(interaction);
                    break;
                case 'webhook-status':
                    await this.webhookStatusCommand(interaction);
                    break;
                case 'register-webhook':
                    await this.registerWebhookCommand(interaction);
                    break;
                case 'test-webhook':
                    await this.testWebhookCommand(interaction);
                    break;
                case 'webhook-config':
                    await this.webhookConfigCommand(interaction);
                    break;
                default:
                    await interaction.reply({ content: 'Unknown command!', ephemeral: true });
            }
        } catch (error) {
            logger.error(`Error handling command ${commandName}:`, error);
            const errorMessage = 'An error occurred while processing your command.';

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }

    async createIssueCommand(interaction) {
        await interaction.deferReply();

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const type = interaction.options.getString('type');
        const priority = interaction.options.getString('priority') || 'medium';

        try {
            const issueNumber = await this.createGitHubIssue(title, description, [type], priority, interaction.user.username);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Issue Created Successfully')
                .setDescription(`GitHub issue #${issueNumber} has been created.`)
                .addFields(
                    { name: 'Title', value: title, inline: false },
                    { name: 'Type', value: type, inline: true },
                    { name: 'Priority', value: priority, inline: true }
                )
                .setURL(`https://github.com/${this.config.repoOwner}/${this.config.repoName}/issues/${issueNumber}`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error creating GitHub issue:', error);
            await interaction.editReply({ content: 'Failed to create GitHub issue. Please check the logs for details.' });
        }
    }

    async createTicketCommand(interaction) {
        await interaction.deferReply();

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const priority = interaction.options.getString('priority') || 'Medium';

        try {
            const ticket = await this.createXTSystemsTicket(title, description, priority, interaction.user.username);

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🎫 Ticket Created Successfully')
                .setDescription(`XTSystems ticket #${ticket.id} has been created.`)
                .addFields(
                    { name: 'Title', value: title, inline: false },
                    { name: 'Priority', value: priority, inline: true },
                    { name: 'Status', value: ticket.status || 'Open', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error creating XTSystems ticket:', error);
            await interaction.editReply({ content: 'Failed to create XTSystems ticket. Please check the logs for details.' });
        }
    }

    async listIssuesCommand(interaction) {
        await interaction.deferReply();

        const limit = interaction.options.getInteger('limit') || 10;

        try {
            const { stdout } = await execAsync(`gh issue list --repo ${this.config.repoOwner}/${this.config.repoName} --limit ${limit} --json number,title,state,labels,assignees`);
            const issues = JSON.parse(stdout);

            if (issues.length === 0) {
                await interaction.editReply({ content: 'No issues found in the repository.' });
                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`📋 Recent Issues (${issues.length})`)
                .setURL(`https://github.com/${this.config.repoOwner}/${this.config.repoName}/issues`)
                .setTimestamp();

            issues.slice(0, 10).forEach(issue => {
                const labels = issue.labels.map(label => label.name).join(', ') || 'No labels';
                const assignees = issue.assignees.map(assignee => assignee.login).join(', ') || 'Unassigned';

                embed.addFields({
                    name: `#${issue.number} - ${issue.title}`,
                    value: `**State:** ${issue.state}\n**Labels:** ${labels}\n**Assignees:** ${assignees}`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error listing GitHub issues:', error);
            await interaction.editReply({ content: 'Failed to retrieve GitHub issues. Please check the logs for details.' });
        }
    }

    async closeIssueCommand(interaction) {
        await interaction.deferReply();

        const issueNumber = interaction.options.getInteger('number');
        const comment = interaction.options.getString('comment') || `Closed via Discord by ${interaction.user.username}`;

        try {
            await execAsync(`gh issue close ${issueNumber} --repo ${this.config.repoOwner}/${this.config.repoName} --comment "${comment}"`);

            const embed = new EmbedBuilder()
                .setColor(0xff9900)
                .setTitle('🔒 Issue Closed')
                .setDescription(`Issue #${issueNumber} has been closed.`)
                .addFields({ name: 'Comment', value: comment, inline: false })
                .setURL(`https://github.com/${this.config.repoOwner}/${this.config.repoName}/issues/${issueNumber}`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error closing GitHub issue:', error);
            await interaction.editReply({ content: `Failed to close issue #${issueNumber}. Please check if the issue exists and you have permissions.` });
        }
    }

    async analyzeConversationCommand(interaction) {
        await interaction.deferReply();

        const messageCount = interaction.options.getInteger('messages') || 20;
        const channelId = interaction.channel.id;
        const history = this.conversationHistory.get(channelId) || [];

        if (history.length === 0) {
            await interaction.editReply({ content: 'No conversation history found for this channel.' });
            return;
        }

        const recentMessages = history.slice(-messageCount);
        const conversationText = recentMessages.map(msg => `${msg.author}: ${msg.content}`).join('\n');

        try {
            const analysis = await this.analyzeWithAGiXT(conversationText, 'Analyze this entire conversation for potential issues or features.');

            const embed = new EmbedBuilder()
                .setColor(0x9966ff)
                .setTitle('🔍 Conversation Analysis')
                .setDescription(`Analyzed ${recentMessages.length} recent messages`)
                .setTimestamp();

            if (analysis && analysis.confidence > 50) {
                embed.addFields(
                    { name: 'Recommendation', value: analysis.shouldCreateIssue ? 'Create Issue' : analysis.shouldCreateFeature ? 'Create Feature' : 'No Action Needed', inline: true },
                    { name: 'Confidence', value: `${analysis.confidence}%`, inline: true },
                    { name: 'Type', value: analysis.issueType || 'N/A', inline: true },
                    { name: 'Reasoning', value: analysis.reasoning || 'No specific reasoning provided', inline: false }
                );

                if (analysis.title) {
                    embed.addFields({ name: 'Suggested Title', value: analysis.title, inline: false });
                }
            } else {
                embed.addFields({ name: 'Result', value: 'No significant issues or features detected in recent conversation.', inline: false });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error analyzing conversation:', error);
            await interaction.editReply({ content: 'Failed to analyze conversation. Please check the logs for details.' });
        }
    }

    async toggleMonitoringCommand(interaction) {
        const channelId = interaction.channel.id;
        const isMonitored = this.config.monitorChannels.includes(channelId);

        if (isMonitored) {
            this.config.monitorChannels = this.config.monitorChannels.filter(id => id !== channelId);
            await interaction.reply({ content: '🔕 Automatic monitoring disabled for this channel.', ephemeral: true });
        } else {
            this.config.monitorChannels.push(channelId);
            await interaction.reply({ content: '🔔 Automatic monitoring enabled for this channel.', ephemeral: true });
        }

        // Update environment file (in a real implementation, you'd want to persist this properly)
        logger.info(`Channel ${channelId} monitoring toggled to: ${!isMonitored}`);
    }

    async linkRepoCommand(interaction) {
        const owner = interaction.options.getString('owner');
        const repo = interaction.options.getString('repo');

        // Update configuration for this guild/channel
        this.config.repoOwner = owner;
        this.config.repoName = repo;

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🔗 Repository Linked')
            .setDescription(`This channel is now linked to **${owner}/${repo}**`)
            .addFields(
                { name: 'Owner', value: owner, inline: true },
                { name: 'Repository', value: repo, inline: true }
            )
            .setURL(`https://github.com/${owner}/${repo}`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        logger.info(`Channel ${interaction.channel.id} linked to repository ${owner}/${repo}`);
    }

    async botStatusCommand(interaction) {
        const uptime = process.uptime();
        const uptimeString = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🤖 Bot Status')
            .addFields(
                { name: 'Status', value: '✅ Online', inline: true },
                { name: 'Uptime', value: uptimeString, inline: true },
                { name: 'Monitored Channels', value: this.config.monitorChannels.length.toString(), inline: true },
                { name: 'Linked Repository', value: `${this.config.repoOwner}/${this.config.repoName}`, inline: false },
                { name: 'Auto Create Issues', value: this.config.autoCreateIssues ? '✅ Enabled' : '❌ Disabled', inline: true },
                { name: 'AGiXT Integration', value: this.config.agitxtApiUrl ? '✅ Configured' : '❌ Not Configured', inline: true },
                { name: 'XTSystems Integration', value: this.config.xtsystemsApiUrl ? '✅ Configured' : '❌ Not Configured', inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleButtonInteraction(interaction) {
        const [action, messageId] = interaction.customId.split('_');

        if (action === 'create' && messageId.startsWith('issue')) {
            await this.handleCreateIssueButton(interaction, messageId.replace('issue_', ''));
        } else if (action === 'ignore' && messageId.startsWith('suggestion')) {
            await this.handleIgnoreButton(interaction);
        }
    }

    async handleCreateIssueButton(interaction, messageId) {
        await interaction.deferReply({ ephemeral: true });

        const analysis = this.analysisCache?.get(messageId);
        if (!analysis) {
            await interaction.editReply({ content: 'Analysis data not found. Please try creating the issue manually.' });
            return;
        }

        try {
            const labels = [analysis.issueType];
            if (analysis.priority && analysis.priority !== 'medium') {
                labels.push(analysis.priority);
            }

            const issueNumber = await this.createGitHubIssue(
                analysis.title,
                analysis.description,
                labels,
                analysis.priority,
                interaction.user.username
            );

            await interaction.editReply({
                content: `✅ Issue #${issueNumber} created successfully! [View Issue](https://github.com/${this.config.repoOwner}/${this.config.repoName}/issues/${issueNumber})`
            });

            // Update the original message
            const originalMessage = await interaction.channel.messages.fetch(messageId);
            const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                .setColor(0x00ff00)
                .setTitle('✅ Issue Created')
                .addFields({ name: 'Issue Number', value: `#${issueNumber}`, inline: true });

            await originalMessage.edit({ embeds: [updatedEmbed], components: [] });
        } catch (error) {
            logger.error('Error creating issue from button:', error);
            await interaction.editReply({ content: 'Failed to create issue. Please try again or create it manually.' });
        }
    }

    async handleIgnoreButton(interaction) {
        await interaction.deferUpdate();

        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x999999)
            .setTitle('❌ Suggestion Ignored');

        await interaction.editReply({ embeds: [updatedEmbed], components: [] });
    }

    async createGitHubIssue(title, body, labels = [], priority = 'medium', author = 'Discord Bot') {
        try {
            const issueBody = `${body}\n\n---\n*Created via Discord by ${author}*\n*Priority: ${priority}*`;

            const command = `gh issue create --repo ${this.config.repoOwner}/${this.config.repoName} --title "${title}" --body "${issueBody}"`;

            if (labels.length > 0) {
                command += ` --label "${labels.join(',')}"`;
            }

            const { stdout } = await execAsync(command);
            const issueUrl = stdout.trim();
            const issueNumber = issueUrl.split('/').pop();

            logger.info(`Created GitHub issue #${issueNumber}: ${title}`);
            return issueNumber;
        } catch (error) {
            logger.error('Error creating GitHub issue:', error);
            throw error;
        }
    }

    async createXTSystemsTicket(title, description, priority = 'Medium', author = 'Discord Bot') {
        try {
            const ticketData = {
                title: title,
                description: `${description}\n\n---\nCreated via Discord by ${author}`,
                status: 'Open',
                priority: priority,
                ticket_type_id: null, // You may want to configure default ticket types
                created_by: author
            };

            const response = await axios.post(`${this.config.xtsystemsApiUrl}/v1/tickets`, ticketData, {
                headers: {
                    'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            logger.info(`Created XTSystems ticket #${response.data.id}: ${title}`);
            return response.data;
        } catch (error) {
            logger.error('Error creating XTSystems ticket:', error);
            throw error;
        }
    }

    async handleDirectCommand(message) {
        const content = message.content.toLowerCase();

        if (content.includes('help')) {
            await this.sendHelpMessage(message);
        } else if (content.includes('status')) {
            await this.sendStatusMessage(message);
        }
    }

    async sendHelpMessage(message) {
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('🤖 XTSystems Discord Bot Help')
            .setDescription('I monitor conversations and help manage GitHub issues and XTSystems tickets.')
            .addFields(
                { name: 'Slash Commands', value: '`/create-issue` - Create a GitHub issue\n`/create-ticket` - Create an XTSystems ticket\n`/list-issues` - List recent issues\n`/close-issue` - Close an issue\n`/analyze-conversation` - Analyze recent chat\n`/toggle-monitoring` - Enable/disable auto monitoring\n`/link-repo` - Link channel to repository\n`/bot-status` - Check bot status', inline: false },
                { name: 'Auto Features', value: '• Monitors conversations for potential issues\n• Suggests creating GitHub issues/tickets\n• Uses AGiXT AI for intelligent analysis\n• Integrates with XTSystems API', inline: false },
                { name: 'Direct Commands', value: 'Mention me or use `!xt help` for this help message\n`!xt status` for quick status check', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems Bot', iconURL: this.client.user.displayAvatarURL() });

        await message.reply({ embeds: [embed] });
    }

    async sendStatusMessage(message) {
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🤖 Quick Status')
            .addFields(
                { name: 'Repository', value: `${this.config.repoOwner}/${this.config.repoName}`, inline: true },
                { name: 'Monitoring', value: this.config.monitorChannels.includes(message.channel.id) ? '✅ On' : '❌ Off', inline: true },
                { name: 'Auto Issues', value: this.config.autoCreateIssues ? '✅ On' : '❌ Off', inline: true }
                    .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    setupWebhookServer() {
        this.app = express();

        // Security middleware
        this.app.use(helmet());

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP'
        });
        this.app.use(limiter);

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.raw({ type: 'application/json', limit: '10mb' }));

        // Webhook verification middleware
        this.app.use(this.config.webhookPath, this.verifyWebhookSignature.bind(this));

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                service: 'xtsystems-discord-bot',
                timestamp: new Date().toISOString(),
                discord: this.client.isReady() ? 'connected' : 'disconnected'
            });
        });

        // XTSystems webhook endpoint
        this.app.post(this.config.webhookPath, this.handleXTSystemsWebhook.bind(this));

        // Webhook management endpoints
        this.app.get('/webhooks/config', this.getWebhookConfig.bind(this));
        this.app.post('/webhooks/register', this.registerWebhookInXTSystems.bind(this));

        // Start the webhook server
        this.webhookServer = this.app.listen(this.config.webhookPort, () => {
            logger.info(`Webhook server listening on port ${this.config.webhookPort}`);
            logger.info(`XTSystems webhook endpoint: http://localhost:${this.config.webhookPort}${this.config.webhookPath}`);
        });
    }

    verifyWebhookSignature(req, res, next) {
        const signature = req.headers['x-xtsystems-signature'];
        const timestamp = req.headers['x-xtsystems-timestamp'];

        if (!signature || !timestamp) {
            logger.warn('Missing webhook signature or timestamp');
            return res.status(401).json({ error: 'Missing signature or timestamp' });
        }

        // Check timestamp to prevent replay attacks (5 minute window)
        const timestampDiff = Math.abs(Date.now() - parseInt(timestamp));
        if (timestampDiff > 5 * 60 * 1000) {
            logger.warn('Webhook timestamp too old');
            return res.status(401).json({ error: 'Timestamp too old' });
        }

        // Verify signature
        const body = JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', this.config.webhookSecret)
            .update(timestamp + body)
            .digest('hex');

        if (signature !== `sha256=${expectedSignature}`) {
            logger.warn('Invalid webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        next();
    }

    async handleXTSystemsWebhook(req, res) {
        try {
            const { event_type, data, timestamp, company_id } = req.body;

            logger.info(`Received XTSystems webhook: ${event_type}`, { company_id, timestamp });

            // Process different event types
            switch (event_type) {
                case 'ticket.created':
                    await this.handleTicketCreated(data);
                    break;
                case 'ticket.updated':
                    await this.handleTicketUpdated(data);
                    break;
                case 'ticket.closed':
                    await this.handleTicketClosed(data);
                    break;
                case 'asset.created':
                    await this.handleAssetCreated(data);
                    break;
                case 'asset.updated':
                    await this.handleAssetUpdated(data);
                    break;
                case 'user.created':
                    await this.handleUserCreated(data);
                    break;
                case 'company.created':
                    await this.handleCompanyCreated(data);
                    break;
                case 'machine.registered':
                    await this.handleMachineRegistered(data);
                    break;
                case 'machine.approved':
                    await this.handleMachineApproved(data);
                    break;
                case 'alert.triggered':
                    await this.handleAlertTriggered(data);
                    break;
                default:
                    logger.warn(`Unknown webhook event type: ${event_type}`);
            }

            res.status(200).json({ success: true, message: 'Webhook processed successfully' });
        } catch (error) {
            logger.error('Error processing XTSystems webhook:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async handleTicketCreated(ticketData) {
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🎫 New Ticket Created')
            .setDescription(ticketData.description || 'No description provided')
            .addFields(
                { name: 'Ticket ID', value: `#${ticketData.id}`, inline: true },
                { name: 'Title', value: ticketData.title, inline: true },
                { name: 'Priority', value: ticketData.priority || 'Medium', inline: true },
                { name: 'Status', value: ticketData.status || 'Open', inline: true },
                { name: 'Created By', value: ticketData.created_by || 'Unknown', inline: true },
                { name: 'Company', value: ticketData.company_name || 'Unknown', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems', iconURL: this.client.user.displayAvatarURL() });

        await this.sendWebhookNotification('ticket_created', embed, ticketData);
    }

    async handleTicketUpdated(ticketData) {
        const embed = new EmbedBuilder()
            .setColor(0xffaa00)
            .setTitle('📝 Ticket Updated')
            .setDescription(`Ticket #${ticketData.id} has been updated`)
            .addFields(
                { name: 'Title', value: ticketData.title, inline: true },
                { name: 'Status', value: ticketData.status || 'Unknown', inline: true },
                { name: 'Priority', value: ticketData.priority || 'Medium', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems', iconURL: this.client.user.displayAvatarURL() });

        if (ticketData.notes && ticketData.notes.length > 0) {
            const latestNote = ticketData.notes[ticketData.notes.length - 1];
            embed.addFields({ name: 'Latest Note', value: latestNote.content.substring(0, 1000), inline: false });
        }

        await this.sendWebhookNotification('ticket_updated', embed, ticketData);
    }

    async handleTicketClosed(ticketData) {
        const embed = new EmbedBuilder()
            .setColor(0x999999)
            .setTitle('🔒 Ticket Closed')
            .setDescription(`Ticket #${ticketData.id} has been closed`)
            .addFields(
                { name: 'Title', value: ticketData.title, inline: true },
                { name: 'Final Status', value: ticketData.status || 'Closed', inline: true },
                { name: 'Resolution', value: ticketData.resolution || 'No resolution provided', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems', iconURL: this.client.user.displayAvatarURL() });

        await this.sendWebhookNotification('ticket_closed', embed, ticketData);
    }

    async handleAssetCreated(assetData) {
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('💻 New Asset Created')
            .setDescription(`Asset "${assetData.name}" has been created`)
            .addFields(
                { name: 'Asset ID', value: assetData.id.toString(), inline: true },
                { name: 'Name', value: assetData.name, inline: true },
                { name: 'Type', value: assetData.asset_type || 'Unknown', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems', iconURL: this.client.user.displayAvatarURL() });

        if (assetData.description) {
            embed.addFields({ name: 'Description', value: assetData.description.substring(0, 1000), inline: false });
        }

        await this.sendWebhookNotification('asset_created', embed, assetData);
    }

    async handleMachineRegistered(machineData) {
        const embed = new EmbedBuilder()
            .setColor(0xff9900)
            .setTitle('🖥️ New Machine Registered')
            .setDescription(`Machine "${machineData.hostname}" is requesting approval`)
            .addFields(
                { name: 'Hostname', value: machineData.hostname, inline: true },
                { name: 'IP Address', value: machineData.ip_address || 'Unknown', inline: true },
                { name: 'OS', value: machineData.operating_system || 'Unknown', inline: true },
                { name: 'Status', value: 'Pending Approval', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems', iconURL: this.client.user.displayAvatarURL() });

        // Add approve/deny buttons
        const approveButton = new ButtonBuilder()
            .setCustomId(`approve_machine_${machineData.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const denyButton = new ButtonBuilder()
            .setCustomId(`deny_machine_${machineData.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌');

        const row = new ActionRowBuilder().addComponents(approveButton, denyButton);

        await this.sendWebhookNotification('machine_registered', embed, machineData, [row]);
    }

    async handleAlertTriggered(alertData) {
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('🚨 Alert Triggered')
            .setDescription(alertData.message || 'System alert triggered')
            .addFields(
                { name: 'Alert Type', value: alertData.alert_type || 'Unknown', inline: true },
                { name: 'Severity', value: alertData.severity || 'Medium', inline: true },
                { name: 'Source', value: alertData.source || 'System', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'XTSystems Alert', iconURL: this.client.user.displayAvatarURL() });

        if (alertData.details) {
            embed.addFields({ name: 'Details', value: alertData.details.substring(0, 1000), inline: false });
        }

        await this.sendWebhookNotification('alert_triggered', embed, alertData);
    }

    async sendWebhookNotification(eventType, embed, data, components = []) {
        try {
            // Get configured channels for this event type
            const channels = this.config.discordWebhookChannels[eventType] ||
                this.config.discordWebhookChannels['default'] ||
                this.config.monitorChannels;

            if (!channels || channels.length === 0) {
                logger.warn(`No Discord channels configured for event type: ${eventType}`);
                return;
            }

            for (const channelId of channels) {
                try {
                    const channel = await this.client.channels.fetch(channelId);
                    if (channel) {
                        const messageOptions = { embeds: [embed] };
                        if (components.length > 0) {
                            messageOptions.components = components;
                        }
                        await channel.send(messageOptions);
                        logger.info(`Sent webhook notification to channel ${channelId} for event ${eventType}`);
                    }
                } catch (error) {
                    logger.error(`Failed to send notification to channel ${channelId}:`, error);
                }
            }
        } catch (error) {
            logger.error('Error sending webhook notification:', error);
        }
    }

    async getWebhookConfig(req, res) {
        try {
            const config = {
                webhook_url: `${req.protocol}://${req.get('host')}${this.config.webhookPath}`,
                supported_events: [
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
                ],
                discord_channels: this.config.discordWebhookChannels,
                security: {
                    signature_header: 'x-xtsystems-signature',
                    timestamp_header: 'x-xtsystems-timestamp',
                    algorithm: 'sha256'
                }
            };

            res.json(config);
        } catch (error) {
            logger.error('Error getting webhook config:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    async registerWebhookInXTSystems(req, res) {
        try {
            const { webhook_url, events, company_id } = req.body;

            // Register webhook in XTSystems
            const webhookData = {
                url: webhook_url || `${req.protocol}://${req.get('host')}${this.config.webhookPath}`,
                events: events || ['ticket.created', 'ticket.updated', 'ticket.closed'],
                active: true,
                secret: this.config.webhookSecret,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'XTSystems-Discord-Bot/1.0'
                }
            };

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

            logger.info('Successfully registered webhook in XTSystems:', response.data);
            res.json({
                success: true,
                webhook_id: response.data.id,
                message: 'Webhook registered successfully in XTSystems'
            });
        } catch (error) {
            logger.error('Error registering webhook in XTSystems:', error);
            res.status(500).json({
                error: 'Failed to register webhook',
                details: error.response?.data || error.message
            });
        }
    }

    async webhookStatusCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('🔗 Webhook Server Status')
            .addFields(
                { name: 'Server Status', value: this.webhookServer ? '✅ Running' : '❌ Stopped', inline: true },
                { name: 'Port', value: this.config.webhookPort.toString(), inline: true },
                { name: 'Endpoint', value: this.config.webhookPath, inline: true },
                { name: 'Secret Configured', value: this.config.webhookSecret !== 'default-secret' ? '✅ Yes' : '⚠️ Using Default', inline: true }
            )
            .setTimestamp();

        if (this.webhookServer) {
            embed.addFields(
                { name: 'Full URL', value: `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`, inline: false },
                { name: 'Health Check', value: `http://localhost:${this.config.webhookPort}/health`, inline: false }
            );
        }

        await interaction.editReply({ embeds: [embed] });
    }

    async registerWebhookCommand(interaction) {
        await interaction.deferReply();

        const events = interaction.options.getString('events');
        const eventList = events ? events.split(',').map(e => e.trim()) : [
            'ticket.created', 'ticket.updated', 'ticket.closed',
            'asset.created', 'machine.registered', 'alert.triggered'
        ];

        try {
            const webhookUrl = `http://localhost:${this.config.webhookPort}${this.config.webhookPath}`;

            const webhookData = {
                name: 'Discord Bot Integration',
                url: webhookUrl,
                events: eventList,
                secret: this.config.webhookSecret,
                active: true,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'XTSystems-Discord-Bot/1.0'
                }
            };

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

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ Webhook Registered Successfully')
                .setDescription('Discord bot has been registered as a webhook in XTSystems')
                .addFields(
                    { name: 'Webhook ID', value: response.data.id || 'Unknown', inline: true },
                    { name: 'Events', value: eventList.join(', '), inline: false },
                    { name: 'URL', value: webhookUrl, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            logger.info('Successfully registered Discord bot webhook in XTSystems');
        } catch (error) {
            logger.error('Error registering webhook in XTSystems:', error);

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Webhook Registration Failed')
                .setDescription('Failed to register webhook in XTSystems')
                .addFields(
                    { name: 'Error', value: error.response?.data?.detail || error.message, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    async testWebhookCommand(interaction) {
        await interaction.deferReply();

        try {
            // Get list of webhooks from XTSystems
            const response = await axios.get(
                `${this.config.xtsystemsApiUrl}/v1/webhooks`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const webhooks = response.data;
            const discordWebhook = webhooks.find(wh =>
                wh.url.includes(this.config.webhookPath) || wh.name.includes('Discord')
            );

            if (!discordWebhook) {
                await interaction.editReply({
                    content: 'No Discord webhook found in XTSystems. Use `/register-webhook` first.'
                });
                return;
            }

            // Send test webhook
            const testResponse = await axios.post(
                `${this.config.xtsystemsApiUrl}/v1/webhooks/${discordWebhook.id}/test`,
                {},
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.xtsystemsApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🧪 Test Webhook Sent')
                .setDescription('Test webhook has been sent from XTSystems')
                .addFields(
                    { name: 'Webhook ID', value: discordWebhook.id, inline: true },
                    { name: 'Status', value: testResponse.data.success ? '✅ Success' : '❌ Failed', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error testing webhook:', error);

            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('❌ Test Webhook Failed')
                .setDescription('Failed to send test webhook')
                .addFields(
                    { name: 'Error', value: error.response?.data?.detail || error.message, inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }

    async webhookConfigCommand(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('⚙️ Webhook Configuration')
            .addFields(
                { name: 'Webhook Port', value: this.config.webhookPort.toString(), inline: true },
                { name: 'Webhook Path', value: this.config.webhookPath, inline: true },
                { name: 'Secret Set', value: this.config.webhookSecret !== 'default-secret' ? '✅ Yes' : '⚠️ Default', inline: true }
            )
            .setTimestamp();

        // Show channel mappings
        const channelMappings = this.config.discordWebhookChannels;
        if (Object.keys(channelMappings).length > 0) {
            const mappingText = Object.entries(channelMappings)
                .map(([event, channels]) => `**${event}**: ${Array.isArray(channels) ? channels.join(', ') : channels}`)
                .join('\n');

            embed.addFields({ name: 'Channel Mappings', value: mappingText, inline: false });
        } else {
            embed.addFields({ name: 'Channel Mappings', value: 'None configured - using monitor channels', inline: false });
        }

        // Show supported events
        const supportedEvents = [
            'ticket.created', 'ticket.updated', 'ticket.closed',
            'asset.created', 'asset.updated', 'user.created',
            'company.created', 'machine.registered', 'machine.approved',
            'alert.triggered'
        ];

        embed.addFields({ name: 'Supported Events', value: supportedEvents.join(', '), inline: false });

        await interaction.editReply({ embeds: [embed] });
    }

    async start() {
        try {
            await this.client.login(this.config.token);
            logger.info('XTSystems Discord Bot started successfully');
        } catch (error) {
            logger.error('Failed to start bot:', error);
            process.exit(1);
        }
    }
}

// Error handling
process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

// Start the bot
const bot = new XTSystemsDiscordBot();
bot.start();
