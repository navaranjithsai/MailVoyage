import path from 'path';
import { config as appConfig } from './src/utils/config.js'; // Adjust path as necessary
import { fileURLToPath } from 'url';

// Derive __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface KnexConfig {
  [key: string]: object;
}

const knexConfig: KnexConfig = {
  development: {
    client: 'pg',
    connection: appConfig.databaseUrl,
    migrations: {
      directory: path.join(__dirname, 'src', 'db', 'migrations'),
      tableName: 'knex_migrations',
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, 'src', 'db', 'seeds'),
      extension: 'ts',
    },
    useNullAsDefault: true,
  },

  production: {
    client: 'pg',
    connection: appConfig.databaseUrl, // Ensure DATABASE_URL is set in production
    migrations: {
      directory: path.join(__dirname, 'src', 'db', 'migrations'),
      tableName: 'knex_migrations',
      extension: 'ts',
    },
    // Add seeds for production if needed
    // seeds: {
    //   directory: path.join(__dirname, 'src', 'db', 'seeds'),
    // },
    useNullAsDefault: true,
  },
};

export default knexConfig;
