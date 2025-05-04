import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as mysql from 'mysql2/promise';
import { findWordPressConfig } from '../utils/wp-config-finder.js';
import { parseWordPressConfig } from '../utils/wp-config-parser.js';

export interface WordPressConfig {
    configPath: string;
    dbHost: string;
    dbName: string;
    dbUser: string;
    dbPassword: string;
    tablePrefix: string;
    wpPath: string;
}

export interface ThemeInfo {
    name: string;
    path: string;
    active: boolean;
    templateFiles: string[];
}

export class WordPressManager {
    private config: WordPressConfig | null = null;
    private connection: mysql.Connection | null = null;

    /**
     * Check if the WordPress database is connected
     */
    public isConnected(): boolean {
        return this.connection !== null;
    }

    /**
     * Get the WordPress config
     */
    public getConfig(): WordPressConfig | null {
        return this.config;
    }

    /**
     * Get the WordPress table prefix
     */
    public getTablePrefix(): string | null {
        return this.config ? this.config.tablePrefix : null;
    }

    /**
     * Find WordPress configuration file and extract database credentials
     */
    public async findWordPressConfig(): Promise<WordPressConfig | null> {
        try {
            // Get current workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder is open');
                return null;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const configPath = await findWordPressConfig(workspacePath);

            if (!configPath) {
                vscode.window.showWarningMessage('Could not find wp-config.php in this workspace or parent directories');
                return null;
            }

            // Parse WordPress config
            this.config = await parseWordPressConfig(configPath);
            return this.config;
        } catch (error) {
            vscode.window.showErrorMessage(`Error finding WordPress config: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Connect to the WordPress database using credentials from wp-config.php
     */
    public async connectToDatabase(): Promise<boolean> {
        if (!this.config) {
            const config = await this.findWordPressConfig();
            if (!config) {
                return false;
            }
        }

        try {
            // Create MySQL connection
            this.connection = await mysql.createConnection({
                host: this.config!.dbHost,
                user: this.config!.dbUser,
                password: this.config!.dbPassword,
                database: this.config!.dbName
            });

            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect to WordPress database: ${(error as Error).message}`);
            return false;
        }
    }

    /**
     * Execute a query on the WordPress database
     */
    public async query<T>(sql: string, params: any[] = []): Promise<T[]> {
        if (!this.connection) {
            const connected = await this.connectToDatabase();
            if (!connected) {
                throw new Error('Database connection is not established');
            }
        }

        try {
            const [rows] = await this.connection!.query(sql, params);
            return rows as T[];
        } catch (error) {
            vscode.window.showErrorMessage(`Database query error: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get WordPress version
     */
    public async getWordPressVersion(): Promise<string | null> {
        if (!this.config) {
            await this.findWordPressConfig();
            if (!this.config) return null;
        }

        try {
            const rows = await this.query<{ option_value: string }>(
                `SELECT option_value FROM ${this.config!.tablePrefix}options WHERE option_name = 'version'`
            );

            if (rows.length > 0) {
                return rows[0].option_value;
            }
            return null;
        } catch (error) {
            vscode.window.showErrorMessage(`Could not retrieve WordPress version: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get WordPress installation path
     */
    public getWordPressPath(): string | null {
        return this.config ? this.config.wpPath : null;
    }

    /**
     * Get active plugins
     */
    public async getActivePlugins(): Promise<string[]> {
        if (!this.config) {
            await this.findWordPressConfig();
            if (!this.config) return [];
        }

        try {
            const rows = await this.query<{ option_value: string }>(
                `SELECT option_value FROM ${this.config!.tablePrefix}options WHERE option_name = 'active_plugins'`
            );

            if (rows.length > 0) {
                // WordPress stores serialized PHP array in active_plugins
                const serializedPlugins = rows[0].option_value;
                // This is a simplified approach, proper PHP serialization parsing would be needed
                const plugins = serializedPlugins.split(';').filter(p => p.trim().length > 0);
                return plugins;
            }
            return [];
        } catch (error) {
            vscode.window.showErrorMessage(`Could not retrieve active plugins: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Get information about the active WordPress theme
     */
    public async getActiveTheme(): Promise<ThemeInfo | null> {
        if (!this.config) {
            await this.findWordPressConfig();
            if (!this.config) return null;
        }

        try {
            // Query the database for the active theme
            const rows = await this.query<{ option_value: string }>(
                `SELECT option_value FROM ${this.config!.tablePrefix}options WHERE option_name = 'stylesheet'`
            );

            if (rows.length === 0) {
                return null;
            }

            const themeName = rows[0].option_value;
            const themePath = path.join(this.config!.wpPath, 'wp-content', 'themes', themeName);
            
            // Check if theme directory exists
            try {
                const stats = await fs.promises.stat(themePath);
                if (!stats.isDirectory()) {
                    return null;
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error accessing theme directory: ${(error as Error).message}`);
                return null;
            }

            // Get template files
            const templateFiles = await this.findThemeTemplateFiles(themePath);

            return {
                name: themeName,
                path: themePath,
                active: true,
                templateFiles
            };
        } catch (error) {
            vscode.window.showErrorMessage(`Error getting active theme: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Find all template files in a WordPress theme
     */
    private async findThemeTemplateFiles(themePath: string): Promise<string[]> {
        try {
            const files = await fs.promises.readdir(themePath);
            const templateFiles: string[] = [];
            
            for (const file of files) {
                if (file.endsWith('.php')) {
                    // Read the file to check if it has the Template Name header
                    try {
                        const filePath = path.join(themePath, file);
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        
                        // Check for WordPress template headers
                        if (content.includes('Template Name:') || 
                            this.isWpStandardTemplate(file)) {
                            templateFiles.push(file);
                        }
                    } catch (error) {
                        // Skip files we can't read
                        continue;
                    }
                }
            }
            
            return templateFiles;
        } catch (error) {
            vscode.window.showErrorMessage(`Error finding theme template files: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Check if a filename matches a standard WordPress template
     */
    private isWpStandardTemplate(filename: string): boolean {
        const standardTemplates = [
            'index.php', 
            'single.php', 
            'page.php', 
            'archive.php', 
            'category.php', 
            'tag.php', 
            'author.php', 
            'search.php', 
            '404.php', 
            'front-page.php',
            'home.php',
            'singular.php'
        ];
        
        return standardTemplates.includes(filename);
    }

    /**
     * Get list of registered custom post types
     */
    public async getCustomPostTypes(): Promise<string[]> {
        if (!this.config) {
            await this.findWordPressConfig();
            if (!this.config) return [];
        }

        try {
            // Check if the post_types option exists (some sites store CPT info here)
            const rows = await this.query<{ option_value: string }>(
                `SELECT option_value FROM ${this.config!.tablePrefix}options WHERE option_name = 'cptui_post_types'`
            );

            if (rows.length > 0) {
                // This is a simplified approach, proper PHP serialization parsing would be needed
                const serializedCPTs = rows[0].option_value;
                // Basic extraction - this won't work for all serialization formats
                const cptMatches = serializedCPTs.match(/s:(\d+):"([^"]+)"/g);
                if (cptMatches) {
                    return cptMatches
                        .map(match => {
                            const nameMatch = match.match(/s:\d+:"([^"]+)"/);
                            return nameMatch ? nameMatch[1] : null;
                        })
                        .filter((name): name is string => name !== null);
                }
            }

            // Fallback - check post types by querying posts table
            const postTypeRows = await this.query<{ post_type: string }>(
                `SELECT DISTINCT post_type FROM ${this.config!.tablePrefix}posts 
                 WHERE post_type NOT IN ('post', 'page', 'attachment', 'revision', 'nav_menu_item')
                 LIMIT 20`
            );

            return postTypeRows.map(row => row.post_type);
        } catch (error) {
            vscode.window.showErrorMessage(`Error getting custom post types: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Close database connection
     */
    public async disconnect(): Promise<void> {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
        }
    }
}