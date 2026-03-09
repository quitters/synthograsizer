/**
 * Debug Logger Utility
 * Provides environment-aware logging with different log levels
 * Replaces scattered console.log statements throughout the codebase
 */

export class Logger {
    constructor(context = 'App') {
        this.context = context;
        this.debugMode = this.getDebugMode();
        this.logLevel = this.getLogLevel();
    }

    /**
     * Get debug mode from environment or localStorage
     */
    getDebugMode() {
        // Check localStorage for debug flag
        if (typeof window !== 'undefined' && window.localStorage) {
            const debugFlag = localStorage.getItem('glitcher_debug');
            if (debugFlag !== null) {
                return debugFlag === 'true';
            }
        }
        
        // Default to false in production, true in development
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1';
    }

    /**
     * Get log level (0=off, 1=error, 2=warn, 3=info, 4=debug)
     */
    getLogLevel() {
        if (typeof window !== 'undefined' && window.localStorage) {
            const level = localStorage.getItem('glitcher_log_level');
            if (level !== null) {
                return parseInt(level, 10);
            }
        }
        return this.debugMode ? 4 : 2; // Debug shows all, production shows warn+error
    }

    /**
     * Format message with context and timestamp
     */
    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
        const prefix = `[${timestamp}] [${this.context}] [${level}]`;
        return [prefix, message, ...args];
    }

    /**
     * Debug level logging (most verbose)
     */
    debug(message, ...args) {
        if (this.logLevel >= 4) {
            console.log(...this.formatMessage('DEBUG', message, ...args));
        }
    }

    /**
     * Info level logging
     */
    info(message, ...args) {
        if (this.logLevel >= 3) {
            console.log(...this.formatMessage('INFO', message, ...args));
        }
    }

    /**
     * Warning level logging
     */
    warn(message, ...args) {
        if (this.logLevel >= 2) {
            console.warn(...this.formatMessage('WARN', message, ...args));
        }
    }

    /**
     * Error level logging (always shown)
     */
    error(message, ...args) {
        if (this.logLevel >= 1) {
            console.error(...this.formatMessage('ERROR', message, ...args));
        }
    }

    /**
     * Log with emoji prefix (for visual scanning)
     */
    success(message, ...args) {
        if (this.logLevel >= 3) {
            console.log('✅', ...this.formatMessage('SUCCESS', message, ...args));
        }
    }

    /**
     * Group logging (for nested logs)
     */
    group(label) {
        if (this.logLevel >= 3) {
            console.group(`[${this.context}] ${label}`);
        }
    }

    groupEnd() {
        if (this.logLevel >= 3) {
            console.groupEnd();
        }
    }

    /**
     * Performance timing
     */
    time(label) {
        if (this.logLevel >= 4) {
            console.time(`[${this.context}] ${label}`);
        }
    }

    timeEnd(label) {
        if (this.logLevel >= 4) {
            console.timeEnd(`[${this.context}] ${label}`);
        }
    }

    /**
     * Table display for structured data
     */
    table(data) {
        if (this.logLevel >= 3) {
            console.table(data);
        }
    }

    /**
     * Enable/disable debug mode at runtime
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        this.logLevel = enabled ? 4 : 2;
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem('glitcher_debug', enabled.toString());
            localStorage.setItem('glitcher_log_level', this.logLevel.toString());
        }
    }
}

/**
 * Create logger instances for different modules
 */
export function createLogger(context) {
    return new Logger(context);
}

/**
 * Global logger for general use
 */
export const logger = new Logger('Glitcher');

/**
 * Console helpers for easy debugging
 */
if (typeof window !== 'undefined') {
    window.glitcherDebug = {
        enable: () => logger.setDebugMode(true),
        disable: () => logger.setDebugMode(false),
        setLevel: (level) => {
            logger.logLevel = level;
            localStorage.setItem('glitcher_log_level', level.toString());
        },
        status: () => ({
            debugMode: logger.debugMode,
            logLevel: logger.logLevel
        })
    };
    
    console.log('💡 Glitcher Debug Utils available: window.glitcherDebug');
}
