# Database Provider (CLI-driven)

Zero-dependency database access for project scan and code review workflows. Executes SQL queries via CLI subprocess calls (psql, mysql, java jar).

## Problem

During project scan and code review, the audit tool needs to fetch database schema metadata (tables, columns, indexes, foreign keys) and sample data from real databases. The project has a strict no-npm-install policy.

## Design

### Architecture

```
lib/db-providers/
  index.mjs        — createDbProvider(config) entry point
  base.mjs         — execCli(), parseTsv(), error handling
  psql.mjs         — PostgreSQL via psql CLI
  mysql-cli.mjs    — MySQL via mysql CLI
  jdbc.mjs         — Generic JDBC via java -cp jar
```

### Configuration

Stored in `.audit/settings.yaml` under a `database` key, or passed directly.

```yaml
database:
  provider: psql          # psql | mysql | jdbc
  host: localhost
  port: 5432
  database: myapp
  user: readonly
  password_env: DB_PASSWORD   # env var name holding password
  # jdbc-specific
  jar: /path/to/driver.jar
  class: org.postgresql.Driver
  jdbc_url: jdbc:postgresql://localhost:5432/myapp
```

Passwords are never stored. The `password_env` field names an environment variable that must be set at runtime.

### Unified Query Result

All providers return the same shape:

```js
{ columns: string[], rows: any[][] }
```

### Provider Interface

Each provider implements:

```ts
interface DbProvider {
  query(sql: string): Promise<{ columns: string[], rows: any[][] }>
  listTables(schema?: string): Promise<{ columns, rows }>
  listColumns(table: string, schema?: string): Promise<{ columns, rows }>
  listIndexes(table: string, schema?: string): Promise<{ columns, rows }>
  listForeignKeys(table: string, schema?: string): Promise<{ columns, rows }>
  sample(table: string, limit?: number, schema?: string): Promise<{ columns, rows }>
  testConnection(): Promise<boolean>
}
```

### Provider Details

#### psql

- Command: `psql -h <host> -p <port> -U <user> -d <database> -A -F '\t' -c "<sql>"`
- Flags: `-A` unaligned output, `-F '\t'` tab separator, `-t` tuples only (for data queries), `--csv` for header parsing
- Password: `PGPASSWORD` env var
- Schema queries use `information_schema` standard SQL
- Timeout: 30s default

#### mysql-cli

- Command: `mysql -h <host> -P <port> -u <user> -D <database> -e "<sql>" --batch --raw`
- Flags: `--batch` tab-separated output, `--raw` no escaping
- Password: `MYSQL_PWD` env var
- Schema queries use `information_schema` standard SQL
- Timeout: 30s default

#### jdbc

- Requires a helper Java class or uses `java -cp <jar>` with inline SQL execution
- Command: `java -cp <jar>:<helper> DbQueryRunner "<jdbc_url>" "<user>" "<password>" "<sql>"`
- A small helper class (`DbQueryRunner.java`) compiles to a jar, outputs TSV
- Password: read from env var, passed as CLI arg (masked in process listing where needed)
- Timeout: 30s default

### base.mjs Shared Logic

```js
// Execute CLI command with timeout and error handling
execCli(command, args, envOverrides, timeoutMs = 30000)

// Parse tab-separated output into { columns, rows }
parseTsv(rawOutput)

// Parse CLI stderr into readable error
formatCliError(stderr, command)
```

### Integration Points

1. **Project scan** (`project-scan.mjs`) — can optionally fetch live DB schema alongside static code analysis
2. **Settings** — database config lives in `.audit/settings.yaml`, edited via settings handler
3. **Future** — API endpoints for DB exploration in the review UI

### Error Handling

- CLI not found → clear message: "psql not found. Install PostgreSQL client tools or choose a different provider."
- Auth failure → surface the CLI error without leaking password
- Timeout → kill process, throw with timeout message
- Invalid SQL → surface the database error from stderr

### Security

- Passwords only via environment variables, never stored in config files
- SQL queries are read-only (no mutation API exposed)
- Connection config validated before execution
