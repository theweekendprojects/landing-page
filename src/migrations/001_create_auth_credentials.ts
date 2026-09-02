import { sql } from "kysely";

export const up = sql`
	CREATE TABLE IF NOT EXISTS auth_credentials (
		id VARCHAR(255) PRIMARY KEY,
		user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		hashed_password TEXT NOT NULL,
		provider_id VARCHAR(255) NOT NULL DEFAULT 'credential',
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_auth_credentials_user_id ON auth_credentials(user_id);
`;

export const down = sql`
	DROP TABLE IF EXISTS auth_credentials;
`;
