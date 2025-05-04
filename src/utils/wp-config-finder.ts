import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFileAsync = promisify(fs.readFile);
const existsAsync = promisify(fs.exists);

/**
 * Search for a wp-config.php file starting from the current directory
 * and moving up through parent directories
 */
export async function findWordPressConfig(startPath: string): Promise<string | null> {
    let currentPath = startPath;
    const rootPath = path.parse(startPath).root;
    
    // Keep searching up the directory tree until we reach the root
    while (currentPath !== rootPath) {
        const configPath = path.join(currentPath, 'wp-config.php');
        
        if (await existsAsync(configPath)) {
            return configPath;
        }
        
        // Move up one directory level
        const parentPath = path.dirname(currentPath);
        
        // If we've reached the root or can't go up anymore, stop searching
        if (parentPath === currentPath) {
            break;
        }
        
        currentPath = parentPath;
    }
    
    return null;
}