import * as vscode from 'vscode';
import { WordPressManager } from './wordpress-manager';

/**
 * Interface representing a WordPress context provider response
 */
interface WordPressContextResponse {
    type: 'database_info' | 'theme_info' | 'plugin_info' | 'general_info' | 'custom_post_types';
    data: any;
    message: string;
}

/**
 * Register a proper Model Context Protocol provider for WordPress integration
 */
export function registerMCPProvider(context: vscode.ExtensionContext, wpManager: WordPressManager) {
    // Check if VS Code Chat API exists
    if (!vscode.chat) {
        console.log('VS Code chat API not available - MCP features disabled');
        return;
    }
    
    // Create a request handler for WordPress queries
    const wordpressRequestHandler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest, 
        _chatContext: vscode.ChatContext, 
        stream: vscode.ChatResponseStream, 
        _token: vscode.CancellationToken
    ) => {
        try {
            // Ensure we have WordPress configuration data
            if (!wpManager.getConfig()) {
                await wpManager.findWordPressConfig();
            }
            
            const config = wpManager.getConfig();
            if (!config) {
                stream.markdown("WordPress configuration not found. Please open a folder containing WordPress installation.");
                return;
            }
            
            const query = request.prompt.toLowerCase();
            let response: WordPressContextResponse | null = null;
            
            // Handle database information queries
            if (query.includes('database') || query.includes('db') || 
                query.includes('username') || query.includes('wp-config')) {
                
                response = await handleDatabaseQuery(wpManager, query);
            }
            // Handle theme queries
            else if (query.includes('theme')) {
                response = await handleThemeQuery(wpManager, query);
            }
            // Handle plugin queries
            else if (query.includes('plugin')) {
                response = await handlePluginQuery(wpManager, query);
            }
            // Handle custom post type queries
            else if (query.includes('post type') || query.includes('cpt')) {
                response = await handlePostTypeQuery(wpManager, query);
            }
            // Default to general WordPress info
            else {
                response = await handleGeneralInfoQuery(wpManager, query);
            }
            
            if (response) {
                // Send the response
                stream.markdown(response.message);
                
                // Store metadata - VS Code API doesn't have a set() method, so we'll use a different approach
                // We can't attach metadata directly, but we can pass it through the followup provider
            } else {
                stream.markdown("I couldn't understand your WordPress-related question. Try asking about the database, themes, plugins, or custom post types.");
            }
        } catch (error) {
            stream.markdown(`Error retrieving WordPress data: ${(error as Error).message}`);
        }
    };
    
    // Create chat participant using the VS Code API
    const wordpressParticipant = vscode.chat.createChatParticipant('wordpress', wordpressRequestHandler);
    
    // Set properties for the participant
    wordpressParticipant.iconPath = new vscode.ThemeIcon('database');
    
    // Add followup provider
    wordpressParticipant.followupProvider = {
        provideFollowups(result) {
            // Provide follow-up questions based on the results
            // ChatMessageRole doesn't exist, use strings instead
            const userRole = 'user';
            
            // Use hardcoded follow-ups since we can't access metadata directly
            return [
                { prompt: 'Show database information', role: userRole },
                { prompt: 'What is the database username?', role: userRole },
                { prompt: 'What is the database name?', role: userRole },
                { prompt: 'What theme is active?', role: userRole },
                { prompt: 'List active plugins', role: userRole }
            ];
        }
    };
    
    // Register the legacy command handler for backwards compatibility
    const configChatCommandHandler = vscode.commands.registerCommand('mcp-wordpress.answerConfigQuestion', async (question: string) => {
        // First ensure we have WordPress configuration data
        if (!wpManager.getConfig()) {
            await wpManager.findWordPressConfig();
        }
        
        const config = wpManager.getConfig();
        if (!config) {
            return "Sorry, I couldn't find a WordPress configuration file. Make sure you have a wp-config.php file in your project or its parent directories.";
        }
        
        // Parse the question and provide appropriate response
        question = question.toLowerCase();
        
        if (question.includes('username') || question.includes('user') || question.includes('db_user')) {
            return `The database username in your wp-config.php is: ${config.dbUser}`;
        }
        
        if (question.includes('database name') || question.includes('db name') || question.includes('db_name')) {
            return `The database name in your wp-config.php is: ${config.dbName}`;
        }
        
        if (question.includes('host') || question.includes('db_host')) {
            return `The database host in your wp-config.php is: ${config.dbHost}`;
        }
        
        if (question.includes('password') || question.includes('db_password')) {
            return `The database password is defined in your wp-config.php at: ${config.configPath}`;
        }
        
        if (question.includes('prefix') || question.includes('table prefix')) {
            return `The table prefix in your wp-config.php is: ${config.tablePrefix}`;
        }
        
        if (question.includes('config') || question.includes('wp-config') || question.includes('configuration')) {
            return `WordPress configuration was found at: ${config.configPath}\n\nIt contains the following settings:\n- Database name: ${config.dbName}\n- Database user: ${config.dbUser}\n- Database host: ${config.dbHost}\n- Table prefix: ${config.tablePrefix}`;
        }
        
        // Default response if question not understood
        return `I found your WordPress configuration at ${config.configPath}, but I'm not sure what specific information you're looking for. Try asking about database name, username, host, or table prefix.`;
    });

    // Register completions and hover providers
    registerWordPressCompletionProviders(context, wpManager);
    
    // Register all providers with the extension context
    context.subscriptions.push(
        wordpressParticipant,
        configChatCommandHandler
    );
}

/**
 * Handle database-related queries
 */
async function handleDatabaseQuery(wpManager: WordPressManager, query: string): Promise<WordPressContextResponse> {
    const config = wpManager.getConfig()!;
    let message = '';
    
    if (query.includes('username') || query.includes('user') || query.includes('db_user')) {
        message = `The database username in your wp-config.php is: ${config.dbUser}`;
    } else if (query.includes('name') || query.includes('db_name')) {
        message = `The database name in your wp-config.php is: ${config.dbName}`;
    } else if (query.includes('host') || query.includes('db_host')) {
        message = `The database host in your wp-config.php is: ${config.dbHost}`;
    } else if (query.includes('prefix') || query.includes('table')) {
        message = `The table prefix in your wp-config.php is: ${config.tablePrefix}`;
    } else {
        message = `WordPress database configuration:\n\n- Database name: ${config.dbName}\n- Database user: ${config.dbUser}\n- Database host: ${config.dbHost}\n- Table prefix: ${config.tablePrefix}\n\nConfiguration file: ${config.configPath}`;
    }
    
    return {
        type: 'database_info',
        data: {
            dbName: config.dbName,
            dbUser: config.dbUser,
            dbHost: config.dbHost,
            tablePrefix: config.tablePrefix,
            configPath: config.configPath
        },
        message
    };
}

/**
 * Handle theme-related queries
 */
async function handleThemeQuery(wpManager: WordPressManager, query: string): Promise<WordPressContextResponse> {
    const theme = await wpManager.getActiveTheme();
    
    if (!theme) {
        return {
            type: 'theme_info',
            data: null,
            message: 'Could not retrieve theme information. The WordPress database may not be accessible or no theme is active.'
        };
    }
    
    let message = '';
    
    if (query.includes('template') || query.includes('file')) {
        message = `Template files in the active theme "${theme.name}":\n\n${theme.templateFiles.map(file => `- ${file}`).join('\n')}`;
    } else {
        message = `Active WordPress theme: ${theme.name}\nTheme path: ${theme.path}\nNumber of template files: ${theme.templateFiles.length}`;
    }
    
    return {
        type: 'theme_info',
        data: theme,
        message
    };
}

/**
 * Handle plugin-related queries
 */
async function handlePluginQuery(wpManager: WordPressManager, _query: string): Promise<WordPressContextResponse> {
    const plugins = await wpManager.getActivePlugins();
    
    if (!plugins || plugins.length === 0) {
        return {
            type: 'plugin_info',
            data: [],
            message: 'No active plugins were found or the WordPress database is not accessible.'
        };
    }
    
    const message = `Active WordPress plugins (${plugins.length}):\n\n${plugins.map((plugin, index) => `${index + 1}. ${plugin}`).join('\n')}`;
    
    return {
        type: 'plugin_info',
        data: plugins,
        message
    };
}

/**
 * Handle custom post type queries
 */
async function handlePostTypeQuery(wpManager: WordPressManager, _query: string): Promise<WordPressContextResponse> {
    const customPostTypes = await wpManager.getCustomPostTypes();
    
    if (!customPostTypes || customPostTypes.length === 0) {
        return {
            type: 'custom_post_types',
            data: [],
            message: 'No custom post types were found in this WordPress installation.'
        };
    }
    
    const message = `Custom post types in this WordPress installation (${customPostTypes.length}):\n\n${customPostTypes.map((cpt, index) => `${index + 1}. ${cpt}`).join('\n')}`;
    
    return {
        type: 'custom_post_types',
        data: customPostTypes,
        message
    };
}

/**
 * Handle general WordPress info queries
 */
async function handleGeneralInfoQuery(wpManager: WordPressManager, _query: string): Promise<WordPressContextResponse> {
    const config = wpManager.getConfig()!;
    const wpVersion = await wpManager.getWordPressVersion();
    
    const message = `WordPress Information:\n\n` +
        `- WordPress Version: ${wpVersion || 'Unknown'}\n` +
        `- WordPress Path: ${config.wpPath}\n` +
        `- Configuration File: ${config.configPath}\n` +
        `- Database Name: ${config.dbName}\n` +
        `- Database User: ${config.dbUser}\n\n` +
        `You can ask me about database details, active theme, plugins, or custom post types.`;
    
    return {
        type: 'general_info',
        data: {
            version: wpVersion,
            path: config.wpPath,
            configPath: config.configPath
        },
        message
    };
}

/**
 * Register WordPress completion and hover providers
 */
function registerWordPressCompletionProviders(context: vscode.ExtensionContext, wpManager: WordPressManager) {
    // Create a document selector for PHP files
    const documentSelector = [
        { scheme: 'file', language: 'php' }
    ];

    // Create a completion provider for WordPress functions and hooks
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        documentSelector,
        {
            async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const linePrefix = document.lineAt(position).text.slice(0, position.character);
                
                // Check if line prefix indicates we should provide WordPress-specific completions
                if (!linePrefix.endsWith('add_') && !linePrefix.endsWith('wp_') && !linePrefix.endsWith('get_')) {
                    return undefined;
                }

                // Try to get WordPress info
                await wpManager.findWordPressConfig();
                
                // Create WordPress function completions
                const completions = new Array<vscode.CompletionItem>();
                
                if (linePrefix.endsWith('add_')) {
                    // WordPress hook functions
                    const hookFunctions = ['add_action', 'add_filter', 'add_shortcode', 'add_menu_page', 'add_submenu_page'];
                    
                    hookFunctions.forEach(func => {
                        const item = new vscode.CompletionItem(func, vscode.CompletionItemKind.Function);
                        item.detail = `WordPress Hook: ${func}`;
                        item.documentation = new vscode.MarkdownString(`WordPress hook function ${func}`);
                        completions.push(item);
                    });
                }
                
                if (linePrefix.endsWith('wp_')) {
                    // Common WordPress functions
                    const wpFunctions = ['wp_enqueue_style', 'wp_enqueue_script', 'wp_insert_post', 'wp_query'];
                    
                    wpFunctions.forEach(func => {
                        const item = new vscode.CompletionItem(func, vscode.CompletionItemKind.Function);
                        item.detail = `WordPress API: ${func}`;
                        item.documentation = new vscode.MarkdownString(`WordPress API function ${func}`);
                        completions.push(item);
                    });
                }
                
                if (linePrefix.endsWith('get_')) {
                    // Get custom post types and suggest them
                    const customPostTypes = await wpManager.getCustomPostTypes();
                    
                    // Add template function for custom post types
                    if (customPostTypes.length > 0) {
                        customPostTypes.forEach(cpt => {
                            const getPostTypeItem = new vscode.CompletionItem(`get_${cpt}`, vscode.CompletionItemKind.Function);
                            getPostTypeItem.detail = `WordPress Custom: get_${cpt}`;
                            getPostTypeItem.documentation = new vscode.MarkdownString(`Get ${cpt} custom post type`);
                            getPostTypeItem.insertText = new vscode.SnippetString(`get_posts(array(
    'post_type' => '${cpt}',
    'numberposts' => \${1:-1},
    'post_status' => 'publish'
))`);
                            completions.push(getPostTypeItem);
                        });
                    }
                    
                    // Standard get functions
                    const getFunctions = ['get_template_part', 'get_header', 'get_footer', 'get_sidebar', 'get_post_meta'];
                    getFunctions.forEach(func => {
                        const item = new vscode.CompletionItem(func, vscode.CompletionItemKind.Function);
                        item.detail = `WordPress API: ${func}`;
                        item.documentation = new vscode.MarkdownString(`WordPress template function ${func}`);
                        completions.push(item);
                    });
                }
                
                return completions;
            }
        }
    );
    
    context.subscriptions.push(completionProvider);

    // Other code completion and hover providers can be registered here...
    // ... (similar to the existing implementation)
}

/**
 * Check if a function name is a WordPress function
 */
function isWordPressFunction(functionName: string): boolean {
    // List of common prefixes for WordPress functions
    const wpPrefixes = ['wp_', 'get_', 'the_', 'is_', 'add_', 'do_', 'has_'];
    return wpPrefixes.some(prefix => functionName.startsWith(prefix));
}