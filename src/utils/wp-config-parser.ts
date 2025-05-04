import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { WordPressConfig } from '../mcp/wordpress-manager';

const readFileAsync = promisify(fs.readFile);

/**
 * Extract WordPress configuration values from wp-config.php
 */
export async function parseWordPressConfig(configPath: string): Promise<WordPressConfig> {
    const configContent = await readFileAsync(configPath, 'utf8');
    const configDir = path.dirname(configPath);
    
    // Extract database connection details using regex
    const dbName = extractConfigValue(configContent, 'DB_NAME');
    const dbUser = extractConfigValue(configContent, 'DB_USER');
    const dbPassword = extractConfigValue(configContent, 'DB_PASSWORD');
    const dbHost = extractConfigValue(configContent, 'DB_HOST') || 'localhost';
    const tablePrefix = extractConfigValue(configContent, 'table_prefix') || 'wp_';
    
    // Construct WordPress config object
    const wpConfig: WordPressConfig = {
        configPath,
        dbHost,
        dbName,
        dbUser,
        dbPassword,
        tablePrefix,
        wpPath: configDir
    };
    
    return wpConfig;
}

/**
 * Extract a specific configuration value from wp-config.php content
 */
function extractConfigValue(content: string, key: string): string {
    // Handle quoted values - both single and double quotes
    const doubleQuotesRegex = new RegExp(`define\\s*\\(\\s*['"]${key}['"]\\s*,\\s*["']([^"']+)["']\\s*\\)`, 'i');
    const doubleQuotesMatch = content.match(doubleQuotesRegex);
    if (doubleQuotesMatch && doubleQuotesMatch[1]) {
        return doubleQuotesMatch[1];
    }

    // Handle table_prefix which uses a different format
    if (key === 'table_prefix') {
        const tablePrefixRegex = /\$table_prefix\s*=\s*['"]([^'"]+)['"]/i;
        const match = content.match(tablePrefixRegex);
        return match && match[1] ? match[1] : 'wp_';
    }
    
    return '';
}