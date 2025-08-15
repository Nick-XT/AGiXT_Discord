const { XTSystemsDiscordBot } = require('./index');

// Test configuration
const testConfig = {
    // Add test-specific configuration here
    logLevel: 'debug',
    dryRun: true // Prevents actual API calls during testing
};

// Mock functions for testing
const mockGitHubAPI = {
    createIssue: jest.fn(),
    listIssues: jest.fn(),
    closeIssue: jest.fn()
};

const mockXTSystemsAPI = {
    createTicket: jest.fn(),
    updateTicket: jest.fn(),
    listTickets: jest.fn()
};

const mockAGiXTAPI = {
    analyzeConversation: jest.fn()
};

describe('XTSystems Discord Bot', () => {
    let bot;

    beforeEach(() => {
        bot = new XTSystemsDiscordBot();
        // Mock external APIs
        bot.githubAPI = mockGitHubAPI;
        bot.xtsystemsAPI = mockXTSystemsAPI;
        bot.agitxtAPI = mockAGiXTAPI;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Message Analysis', () => {
        test('should detect bug reports', async () => {
            const testMessage = {
                content: 'The login feature is broken and not working properly',
                author: { username: 'testuser' },
                channel: { id: '123456789' }
            };

            mockAGiXTAPI.analyzeConversation.mockResolvedValue({
                shouldCreateIssue: true,
                issueType: 'bug',
                confidence: 85,
                title: 'Login feature not working',
                reasoning: 'Message contains bug indicators'
            });

            const analysis = await bot.analyzeWithAGiXT('', testMessage.content);

            expect(analysis.shouldCreateIssue).toBe(true);
            expect(analysis.issueType).toBe('bug');
            expect(analysis.confidence).toBeGreaterThan(70);
        });

        test('should detect feature requests', async () => {
            const testMessage = {
                content: 'It would be nice to have dark mode support',
                author: { username: 'testuser' },
                channel: { id: '123456789' }
            };

            mockAGiXTAPI.analyzeConversation.mockResolvedValue({
                shouldCreateFeature: true,
                issueType: 'enhancement',
                confidence: 80,
                title: 'Add dark mode support',
                reasoning: 'Message contains feature request indicators'
            });

            const analysis = await bot.analyzeWithAGiXT('', testMessage.content);

            expect(analysis.shouldCreateFeature).toBe(true);
            expect(analysis.issueType).toBe('enhancement');
            expect(analysis.confidence).toBeGreaterThan(70);
        });

        test('should fallback to keyword analysis when AI fails', async () => {
            const testMessage = 'This is broken and not working';

            mockAGiXTAPI.analyzeConversation.mockRejectedValue(new Error('API Error'));

            const analysis = await bot.analyzeWithAGiXT('', testMessage);

            expect(analysis).toBeDefined();
            expect(analysis.shouldCreateIssue).toBe(true);
            expect(analysis.reasoning).toContain('Keyword-based analysis');
        });
    });

    describe('GitHub Integration', () => {
        test('should create GitHub issue successfully', async () => {
            const issueData = {
                title: 'Test Issue',
                description: 'Test Description',
                labels: ['bug'],
                priority: 'high'
            };

            mockGitHubAPI.createIssue.mockResolvedValue('123');

            const issueNumber = await bot.createGitHubIssue(
                issueData.title,
                issueData.description,
                issueData.labels,
                issueData.priority,
                'testuser'
            );

            expect(issueNumber).toBe('123');
            expect(mockGitHubAPI.createIssue).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: issueData.title,
                    body: expect.stringContaining(issueData.description)
                })
            );
        });
    });

    describe('XTSystems Integration', () => {
        test('should create XTSystems ticket successfully', async () => {
            const ticketData = {
                title: 'Test Ticket',
                description: 'Test Description',
                priority: 'High'
            };

            mockXTSystemsAPI.createTicket.mockResolvedValue({
                id: 456,
                status: 'Open',
                ...ticketData
            });

            const ticket = await bot.createXTSystemsTicket(
                ticketData.title,
                ticketData.description,
                ticketData.priority,
                'testuser'
            );

            expect(ticket.id).toBe(456);
            expect(ticket.status).toBe('Open');
            expect(mockXTSystemsAPI.createTicket).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: ticketData.title,
                    description: expect.stringContaining(ticketData.description)
                })
            );
        });
    });

    describe('Command Handling', () => {
        test('should handle create-issue command', async () => {
            const mockInteraction = {
                commandName: 'create-issue',
                options: {
                    getString: jest.fn()
                        .mockReturnValueOnce('Test Issue')  // title
                        .mockReturnValueOnce('Test Description')  // description
                        .mockReturnValueOnce('bug')  // type
                        .mockReturnValueOnce('high'), // priority
                },
                user: { username: 'testuser' },
                deferReply: jest.fn(),
                editReply: jest.fn()
            };

            mockGitHubAPI.createIssue.mockResolvedValue('789');

            await bot.createIssueCommand(mockInteraction);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: expect.stringContaining('Issue Created Successfully')
                            })
                        })
                    ])
                })
            );
        });
    });

    describe('Configuration Management', () => {
        test('should validate required configuration', () => {
            const requiredFields = [
                'DISCORD_TOKEN',
                'DISCORD_CLIENT_ID',
                'DISCORD_GUILD_ID',
                'XTSYSTEMS_API_URL',
                'XTSYSTEMS_API_KEY'
            ];

            requiredFields.forEach(field => {
                expect(process.env[field] || bot.config[field.toLowerCase().replace('_', '')]).toBeDefined();
            });
        });

        test('should handle missing optional configuration gracefully', () => {
            expect(() => {
                const botWithMissingConfig = new XTSystemsDiscordBot();
                // Should not throw error with missing optional config
            }).not.toThrow();
        });
    });
});

// Integration tests
describe('Integration Tests', () => {
    // These tests require actual API access and should be run in a test environment
    test.skip('should connect to Discord successfully', async () => {
        // Test Discord connection
    });

    test.skip('should authenticate with GitHub CLI', async () => {
        // Test GitHub CLI authentication
    });

    test.skip('should connect to XTSystems API', async () => {
        // Test XTSystems API connection
    });

    test.skip('should connect to AGiXT API', async () => {
        // Test AGiXT API connection
    });
});

module.exports = {
    mockGitHubAPI,
    mockXTSystemsAPI,
    mockAGiXTAPI
};
