package connection

import (
	"chat/globals"
	"database/sql"
	"strings"
)

func validSqlError(err error) bool {
	if err == nil {
		return false
	}

	content := err.Error()

	// Error 1060: Duplicate column name
	// Error 1050: Table already exists

	return !(strings.Contains(content, "Error 1060") || strings.Contains(content, "Error 1050") || strings.Contains(content, "Error 1061") || strings.Contains(content, "Error 1091"))
}

func checkSqlError(_ sql.Result, err error) error {
	if validSqlError(err) {
		return err
	}

	return nil
}

func execSql(db *sql.DB, sql string, args ...interface{}) error {
	return checkSqlError(globals.ExecDb(db, sql, args...))
}

func doMigration(db *sql.DB) error {
	if globals.SqliteEngine {
		return doSqliteMigration(db)
	}

	// v3.10 migration

	// update `quota`, `used` field in `quota` table
	// migrate `DECIMAL(16, 4)` to `DECIMAL(24, 6)`

	if err := execSql(db, `
		ALTER TABLE quota
		MODIFY COLUMN quota DECIMAL(24, 6),
		MODIFY COLUMN used DECIMAL(24, 6);
	`); err != nil {
		return err
	}

	// add new field `is_banned` in `auth` table
	if err := execSql(db, `
		ALTER TABLE auth
		ADD COLUMN is_banned BOOLEAN DEFAULT FALSE;
	`); err != nil {
		return err
	}

	// add new field `task_id` in `conversation` table to store task id (e.g., video job id)
	if err := execSql(db, `
		ALTER TABLE conversation
		ADD COLUMN task_id VARCHAR(255) NULL;
	`); err != nil {
		return err
	}

	// API access center: migrate the legacy one-key-per-user table to multi-key.
	if err := execSql(db, `CREATE INDEX idx_apikey_user ON apikey (user_id);`); err != nil {
		return err
	}
	if err := execSql(db, `ALTER TABLE apikey DROP INDEX user_id;`); err != nil {
		return err
	}
	apiKeyColumns := []string{
		"ADD COLUMN key_hash CHAR(64) DEFAULT ''",
		"ADD COLUMN key_prefix VARCHAR(24) DEFAULT ''",
		"ADD COLUMN key_last4 VARCHAR(4) DEFAULT ''",
		"ADD COLUMN name VARCHAR(100) DEFAULT 'Default Key'",
		"ADD COLUMN disabled BOOLEAN DEFAULT FALSE",
		"ADD COLUMN expired_at DATETIME NULL",
		"ADD COLUMN quota DECIMAL(24, 6) DEFAULT 0",
		"ADD COLUMN used_quota DECIMAL(24, 6) DEFAULT 0",
		"ADD COLUMN infinite_quota BOOLEAN DEFAULT TRUE",
		"ADD COLUMN ip_whitelist TEXT",
		"ADD COLUMN model_whitelist TEXT",
		"ADD COLUMN token_group VARCHAR(64) DEFAULT 'default'",
		"ADD COLUMN last_used_at DATETIME NULL",
		"ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
	}
	for _, column := range apiKeyColumns {
		if err := execSql(db, "ALTER TABLE apikey "+column+";"); err != nil {
			return err
		}
	}
	if err := execSql(db, `
		UPDATE apikey SET
		  key_hash = SHA2(api_key, 256),
		  key_prefix = LEFT(api_key, 12),
		  key_last4 = RIGHT(api_key, 4),
		  name = CASE WHEN name IS NULL OR name = '' THEN 'Default Key' ELSE name END
		WHERE (key_hash IS NULL OR key_hash = '') AND api_key IS NOT NULL AND api_key <> '';
	`); err != nil {
		return err
	}
	if err := execSql(db, `CREATE UNIQUE INDEX idx_apikey_hash ON apikey (key_hash);`); err != nil {
		return err
	}

	return nil
}

func doSqliteMigration(db *sql.DB) error {
	// v3.10 added sqlite support, no migration needed before this version

	// v4 migration
	// add new field `task_id` in `conversation` table to store task id (e.g., video job id)
	if err := execSql(db, `
		ALTER TABLE conversation
		ADD COLUMN task_id VARCHAR(255) NULL;
	`); err != nil {
		return err
	}

	apiKeyColumns := []string{
		"ADD COLUMN key_hash TEXT DEFAULT ''",
		"ADD COLUMN key_prefix TEXT DEFAULT ''",
		"ADD COLUMN key_last4 TEXT DEFAULT ''",
		"ADD COLUMN name TEXT DEFAULT 'Default Key'",
		"ADD COLUMN disabled BOOLEAN DEFAULT FALSE",
		"ADD COLUMN expired_at DATETIME NULL",
		"ADD COLUMN quota DECIMAL(24, 6) DEFAULT 0",
		"ADD COLUMN used_quota DECIMAL(24, 6) DEFAULT 0",
		"ADD COLUMN infinite_quota BOOLEAN DEFAULT TRUE",
		"ADD COLUMN ip_whitelist TEXT",
		"ADD COLUMN model_whitelist TEXT",
		"ADD COLUMN token_group TEXT DEFAULT 'default'",
		"ADD COLUMN last_used_at DATETIME NULL",
		"ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
	}
	for _, column := range apiKeyColumns {
		_ = execSql(db, "ALTER TABLE apikey "+column+";")
	}

	return nil
}
