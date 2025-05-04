# WordPress MCP Extension for VS Code

This VS Code extension implements a Model Context Protocol (MCP) server for WordPress integration. It helps VS Code understand your WordPress environment, making development easier and more intuitive.

## Features

- **WordPress Configuration Detection**: Automatically finds your wp-config.php file by searching from the current directory up through parent directories
- **Database Integration**: Extracts WordPress database credentials and connects to your WordPress database
- **WordPress Installation Path**: Detects the WordPress installation directory
- **Intelligent Code Completion**: Provides context-aware code completion for WordPress functions and hooks
- **Documentation Hover**: Shows documentation for WordPress functions including the current WordPress version
- **Code Actions**: Offers WordPress-specific code actions and quick fixes

## Requirements

- VS Code 1.74.0 or higher
- A WordPress installation that the extension can access
- Node.js and npm (for development)

## Usage

1. Open a folder that contains a WordPress installation or is a child directory of a WordPress installation
2. The extension will automatically search for a wp-config.php file
3. Use the command `WordPress MCP: Connect to WordPress` to explicitly connect to the WordPress installation
4. Enjoy enhanced WordPress coding with intelligent assistance based on your specific WordPress environment

## Extension Settings

This extension doesn't require any additional settings.

## Known Issues

- PHP serialization parsing is implemented in a simplified way and may not handle all serialized data formats
- Database connection needs to close properly when VS Code shuts down

## Release Notes

### 0.1.0

Initial release of WordPress MCP Extension with basic WordPress integration features.

---

## Development

### Building the Extension

```bash
npm install
npm run compile
```

### Packaging the Extension

```bash
npm install -g vsce
vsce package
```

This creates a `.vsix` file in your project directory that can be installed in VS Code.

### Testing the Extension

After installing the extension, you can test its functionality using these commands:

1. **Test WordPress Connection**:

   ```
   > WordPress MCP: Connect to WordPress
   ```

   This command will search for and connect to your WordPress installation.

2. **View WordPress Configuration**:

   ```
   > WordPress MCP: Show WordPress Configuration
   ```

   This displays database credentials and other WordPress configuration details.

3. **Query WordPress Database**:

   ```
   > WordPress MCP: Query Database
   ```

   This allows you to execute natural language queries against your WordPress database.

4. **Test MCP Integration via Chat**:

   ```
   @wordpress What is the database name in wp-config.php?
   ```

   Use in the VS Code chat interface to test the MCP integration. Other useful queries:

   - @wordpress What is the database username?
   - @wordpress Show me active plugins
   - @wordpress What theme is active?
   - @wordpress What custom post types are available?