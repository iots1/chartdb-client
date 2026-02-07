import React, { useEffect, useState } from 'react';
import {
    migrateIndexedDBToAPI,
    isMigrationComplete,
} from '@/lib/migration/migrate-indexeddb-to-api';
import { Spinner } from '@/components/spinner/spinner';

interface MigrationWrapperProps {
    children: React.ReactNode;
}

export const MigrationWrapper: React.FC<MigrationWrapperProps> = ({
    children,
}) => {
    const [migrationComplete, setMigrationComplete] = useState(false);
    const [migrationError, setMigrationError] = useState<string | null>(null);

    useEffect(() => {
        const runMigration = async () => {
            try {
                // Check if already migrated
                if (isMigrationComplete()) {
                    console.log('Migration already complete');
                    setMigrationComplete(true);
                    return;
                }

                // Try migration with timeout
                console.log('Starting migration from IndexedDB to API...');

                const migrationPromise = migrateIndexedDBToAPI();
                const timeoutPromise = new Promise(
                    (resolve) =>
                        setTimeout(() => resolve({ timeout: true }), 15000) // 15 second timeout
                );

                const result = (await Promise.race([
                    migrationPromise,
                    timeoutPromise,
                ])) as unknown;

                if (
                    result &&
                    typeof result === 'object' &&
                    'timeout' in result &&
                    result.timeout === true
                ) {
                    console.warn(
                        'Migration timed out - API may be unavailable'
                    );
                    // Mark as migrated to prevent infinite retries, even if API is down
                    localStorage.setItem('migrated_to_api_v1', 'true');
                    setMigrationComplete(true);
                    setMigrationError(
                        'Migration timeout: API may be unavailable. The app will continue with local storage only.'
                    );
                    return;
                }

                const migrationResult = result as {
                    success?: boolean;
                    errors?: string[];
                };
                if (migrationResult.success) {
                    console.log('Migration successful:', result);
                    setMigrationComplete(true);
                } else {
                    console.error(
                        'Migration completed with errors:',
                        migrationResult.errors
                    );
                    // Still allow app to load even if migration has errors
                    // Users can retry migration manually if needed
                    setMigrationComplete(true);
                    if (
                        migrationResult.errors &&
                        migrationResult.errors.length > 0
                    ) {
                        setMigrationError(
                            `Migration completed with errors: ${migrationResult.errors.join(
                                ', '
                            )}`
                        );
                    }
                }
            } catch (error) {
                console.error('Fatal migration error:', error);
                // Still allow app to load - don't block on migration failure
                setMigrationComplete(true);

                // Check if it's an API connection error
                const isConnectionError =
                    error instanceof Error &&
                    (error.message.includes('Failed to fetch') ||
                        error.message.includes('Network') ||
                        error.message.includes('CORS'));

                setMigrationError(
                    isConnectionError
                        ? 'Cannot connect to API. The app will continue with local storage only.'
                        : error instanceof Error
                          ? error.message
                          : 'Unknown migration error'
                );
            }
        };

        runMigration();
    }, []);

    if (!migrationComplete) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <Spinner size="large" />
                    <p className="text-sm text-muted-foreground">
                        Migrating data to cloud...
                    </p>
                </div>
            </div>
        );
    }

    if (migrationError) {
        console.warn('Migration error displayed:', migrationError);
    }

    return <>{children}</>;
};
