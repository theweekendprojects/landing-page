import { sql } from "kysely";

export const up = sql`
	CREATE TABLE IF NOT EXISTS auth_verifications (
		id VARCHAR(255) PRIMARY KEY,
		identifier VARCHAR(255) NOT NULL,
		value TEXT NOT NULL,
		expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
		created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_auth_verifications_identifier ON auth_verifications(identifier);
	CREATE INDEX IF NOT EXISTS idx_auth_verifications_expires_at ON auth_verifications(expires_at);
`;

export const down = sql`
	DROP TABLE IF EXISTS auth_verifications;
`;
