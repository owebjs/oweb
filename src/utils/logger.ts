import chalk from 'chalk';

export const successText = (message: string, category: string = 'success') => {
    return `${chalk.bgGreen(` Oweb:${category} `)} ${message}`;
};

export const infoText = (message: string, category: string = 'info') => {
    return `${chalk.bgBlue(` Oweb:${category} `)} ${message}`;
};

export const warnText = (message: string, category: string = 'warn') => {
    return `${chalk.bgYellow(` Oweb:${category} `)} ${message}`;
};

export const errorText = (message: string, category: string = 'error') => {
    return `${chalk.bgRed(` Oweb:${category} `)} ${message}`;
};

export const success = (message: string, category?: string) => {
    console.log(successText(message, category));
};

export const info = (message: string, category?: string) => {
    console.log(infoText(message, category));
};

export const warn = (message: string, category?: string) => {
    console.log(warnText(message, category));
};

export const error = (message: string, category?: string) => {
    console.log(errorText(message, category));
};
