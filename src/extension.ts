import * as vscode from 'vscode';
import { WordPressManager } from './mcp/wordpress-manager.js';
import { registerMCPProvider } from './mcp/mcp-provider.js';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('WordPress MCP extension is now active');

    // Initialize WordPress manager
    const wpManager = new WordPressManager();

    // Register commands
    const connectCommand = vscode.commands.registerCommand('mcp-wordpress.connect', async () => {
        const wpConfig = await wpManager.findWordPressConfig();
        if (wpConfig) {
            vscode.window.showInformationMessage(`WordPress config found at: ${wpConfig.configPath}`);
        } else {
            vscode.window.showErrorMessage('Could not find WordPress configuration (wp-config.php).');
        }
    });

    // Register command to display WordPress configuration
    const showConfigCommand = vscode.commands.registerCommand('mcp-wordpress.showConfig', async () => {
        // First ensure we have a WordPress configuration
        if (!wpManager.getConfig()) {
            const wpConfig = await wpManager.findWordPressConfig();
            if (!wpConfig) {
                vscode.window.showErrorMessage('Could not find WordPress configuration (wp-config.php).');
                return;
            }
        }
        
        const config = wpManager.getConfig();
        if (config) {
            // Create output channel for displaying config
            const outputChannel = vscode.window.createOutputChannel('WordPress Configuration');
            outputChannel.clear();
            outputChannel.appendLine('WordPress Configuration Details:');
            outputChannel.appendLine('----------------------------------------');
            outputChannel.appendLine(`Configuration File: ${config.configPath}`);
            outputChannel.appendLine(`WordPress Root: ${config.wpPath}`);
            outputChannel.appendLine('\nDatabase Details:');
            outputChannel.appendLine(`Database Name: ${config.dbName}`);
            outputChannel.appendLine(`Database User: ${config.dbUser}`);
            outputChannel.appendLine(`Database Host: ${config.dbHost}`);
            outputChannel.appendLine(`Table Prefix: ${config.tablePrefix}`);
            
            // Show the output
            outputChannel.show();
        }
    });

    // Register database query command
    const queryCommand = vscode.commands.registerCommand('mcp-wordpress.queryDatabase', async () => {
        // First ensure we have a WordPress connection
        if (!wpManager.isConnected()) {
            const wpConfig = await wpManager.findWordPressConfig();
            if (!wpConfig) {
                vscode.window.showErrorMessage('Could not find WordPress configuration (wp-config.php).');
                return;
            }
            
            const connected = await wpManager.connectToDatabase();
            if (!connected) {
                vscode.window.showErrorMessage('Failed to connect to WordPress database.');
                return;
            }
        }
        
        // Ask user for the query
        const queryInput = await vscode.window.showInputBox({
            prompt: 'Enter your database query (e.g., "find options like %mss%")',
            placeHolder: 'find options like %pattern%'
        });
        
        if (!queryInput) return;
        
        try {
            // Parse natural language query
            const result = await executeNaturalLanguageQuery(wpManager, queryInput);
            
            // Show results
            if (result && result.length > 0) {
                const outputChannel = vscode.window.createOutputChannel('WordPress Database Query');
                outputChannel.clear();
                outputChannel.appendLine(`Query: ${queryInput}`);
                outputChannel.appendLine('Results:');
                outputChannel.appendLine('----------------------------------------');
                
                result.forEach((row: any, index: number) => {
                    outputChannel.appendLine(`Result #${index + 1}:`);
                    Object.keys(row).forEach(key => {
                        outputChannel.appendLine(`${key}: ${row[key]}`);
                    });
                    outputChannel.appendLine('----------------------------------------');
                });
                
                outputChannel.show();
            } else {
                vscode.window.showInformationMessage('No results found for your query.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Query error: ${(error as Error).message}`);
        }
    });

    context.subscriptions.push(connectCommand, queryCommand, showConfigCommand);

    // Register MCP provider - this now uses the official VS Code MCP API
    registerMCPProvider(context, wpManager);
    
    // Log MCP availability information
    if (vscode.chat) {
        console.log('VS Code chat API is available - MCP features enabled');
    } else {
        console.log('VS Code chat API not available - some MCP features may be limited');
    }
    
    // The languageModelAccessInformation object is only for checking consent status
    // and doesn't have a chatParticipantAdditions property
    if (context.languageModelAccessInformation) {
        console.log('Language model access information is available');
    }
}

/**
 * Execute a natural language query against the WordPress database
 */
async function executeNaturalLanguageQuery(wpManager: WordPressManager, query: string): Promise<any[]> {
    // Get table prefix
    const prefix = wpManager.getTablePrefix();
    if (!prefix) {
        throw new Error('Unable to determine WordPress table prefix');
    }
    
    // Parse natural language query
    const lowerQuery = query.toLowerCase();
    
    // Handle "find options like %pattern%" queries
    if (lowerQuery.includes('option') && lowerQuery.includes('like')) {
        // Extract the pattern
        const patternMatch = query.match(/like\s+(['"]?)%?([^%'"]+)%?(['"]?)/i);
        const pattern = patternMatch ? patternMatch[2] : '';
        
        if (pattern) {
            // Query the options table for the pattern
            return await wpManager.query(
                `SELECT option_id, option_name, option_value 
                FROM ${prefix}options 
                WHERE option_name LIKE ? 
                LIMIT 50`,
                [`%${pattern}%`]
            );
        }
    }
    
    // Handle other query types
    // This can be expanded to handle more complex natural language queries
    
    throw new Error('Could not understand the query. Try "find options like %pattern%"');
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log('WordPress MCP extension has been deactivated');
}