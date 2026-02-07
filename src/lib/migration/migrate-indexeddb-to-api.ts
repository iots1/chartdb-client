/* eslint-disable @typescript-eslint/no-explicit-any */
import Dexie from 'dexie';
import { vertexApi } from '@/lib/vertex-api';

const MIGRATION_FLAG = 'migrated_to_api_v1';

export interface MigrationResult {
    success: boolean;
    message: string;
    diagramsCount: number;
    errors: string[];
}

/**
 * Migrate all data from IndexedDB (Dexie) to MongoDB via Golang API
 * This is a one-time operation triggered on app startup if not already migrated
 */
export async function migrateIndexedDBToAPI(): Promise<MigrationResult> {
    try {
        // Check if already migrated
        const migrated = localStorage.getItem(MIGRATION_FLAG);
        if (migrated === 'true') {
            return {
                success: true,
                message: 'Already migrated',
                diagramsCount: 0,
                errors: [],
            };
        }

        console.log('Starting IndexedDB to API migration...');

        // Open IndexedDB database (Dexie)
        const dexieDB = new Dexie('ChartDB');
        dexieDB.version(1).stores({
            diagrams: '++id, name, databaseType, createdAt, updatedAt',
            db_tables:
                '++id, diagramId, name, x, y, fields, indexes, color, createdAt, width',
            db_relationships:
                '++id, diagramId, name, sourceTableId, targetTableId, sourceFieldId, targetFieldId, type, createdAt',
            config: '++id, defaultDiagramId',
        });

        // Support all schema versions
        dexieDB.version(13).stores({
            diagrams:
                '++id, name, databaseType, databaseEdition, createdAt, updatedAt',
            db_tables:
                '++id, diagramId, name, schema, x, y, fields, indexes, color, createdAt, width, comment, isView, isMaterializedView, order',
            db_relationships:
                '++id, diagramId, name, sourceSchema, sourceTableId, targetSchema, targetTableId, sourceFieldId, targetFieldId, type, createdAt',
            db_dependencies:
                '++id, diagramId, schema, tableId, dependentSchema, dependentTableId, createdAt',
            areas: '++id, diagramId, name, x, y, width, height, color',
            db_custom_types:
                '++id, diagramId, schema, type, kind, values, fields',
            notes: '++id, diagramId, content, x, y, width, height, color',
            config: '++id, defaultDiagramId',
            diagram_filters: 'diagramId, tableIds, schemasIds',
        });

        // Read all diagrams

        const diagrams: any[] = await (dexieDB as any).diagrams.toArray();

        if (diagrams.length === 0) {
            console.log('No diagrams to migrate');
            localStorage.setItem(MIGRATION_FLAG, 'true');
            return {
                success: true,
                message: 'No diagrams to migrate',
                diagramsCount: 0,
                errors: [],
            };
        }

        console.log(`Found ${diagrams.length} diagrams to migrate`);

        const errors: string[] = [];

        // Migrate each diagram
        for (const diagram of diagrams) {
            try {
                console.log(`Migrating diagram: ${diagram.name as string}`);

                // Fetch related entities from IndexedDB

                const rawTables: any[] = await (dexieDB as any).db_tables
                    .where('diagramId')
                    .equals(diagram.id)
                    .toArray();

                // Normalize table fields to ensure proper type structure

                const tables = rawTables.map((table: any) => ({
                    ...table,

                    fields: (table.fields || []).map((field: any) => ({
                        ...field,
                        // Ensure type has id and name
                        type:
                            typeof field.type === 'string'
                                ? {
                                      id: field.type,
                                      name: field.type,
                                  }
                                : field.type || {
                                      id: 'string',
                                      name: 'string',
                                  },
                    })),
                }));

                const rawRelationships: any[] = await (
                    dexieDB as any
                ).db_relationships
                    .where('diagramId')
                    .equals(diagram.id)
                    .toArray();

                // Ensure relationships have required cardinality fields

                const relationships = rawRelationships.map((rel: any) => ({
                    ...rel,
                    sourceCardinality: rel.sourceCardinality || 'many',
                    targetCardinality: rel.targetCardinality || 'one',
                }));

                const dependencies: any[] = await ((
                    dexieDB as any
                ).db_dependencies
                    ?.where('diagramId')
                    .equals(diagram.id)
                    .toArray() || []);

                const areas: any[] = await ((dexieDB as any).areas
                    ?.where('diagramId')
                    .equals(diagram.id)
                    .toArray() || []);

                const customTypes: any[] = await ((
                    dexieDB as any
                ).db_custom_types
                    ?.where('diagramId')
                    .equals(diagram.id)
                    .toArray() || []);

                const notes: any[] = await ((dexieDB as any).notes
                    ?.where('diagramId')
                    .equals(diagram.id)
                    .toArray() || []);

                const diagramFilters: any[] = await ((
                    dexieDB as any
                ).diagram_filters
                    ?.where('diagramId')
                    .equals(diagram.id)
                    .toArray() || []);

                const diagramFilter = diagramFilters[0] || null;

                // Create API-compatible diagram with all entities
                const apiDiagram = {
                    id: diagram.id as string | undefined,
                    name: diagram.name as string,
                    content: {
                        ...diagram,
                        tables: tables.map((t) => ({
                            ...t,
                            diagramId: undefined, // Remove foreign key from content
                        })),
                        relationships: relationships.map((r) => ({
                            ...r,
                            diagramId: undefined,
                        })),
                        dependencies: dependencies.map((d) => ({
                            ...d,
                            diagramId: undefined,
                        })),
                        areas: areas.map((a) => ({
                            ...a,
                            diagramId: undefined,
                        })),
                        customTypes: customTypes.map((ct) => ({
                            ...ct,
                            diagramId: undefined,
                        })),
                        notes: notes.map((n) => ({
                            ...n,
                            diagramId: undefined,
                        })),
                        ...(diagramFilter && {
                            diagramFilter: {
                                ...diagramFilter,
                                diagramId: undefined,
                            },
                        }),
                    } as Record<string, unknown>,
                };

                // Upload to API
                await vertexApi.saveDiagram(apiDiagram);
                console.log(`✓ Migrated diagram: ${diagram.name}`);
            } catch (error) {
                const errorMsg =
                    error instanceof Error ? error.message : String(error);
                console.error(
                    `✗ Error migrating diagram: ${diagram.name}`,
                    error
                );
                errors.push(
                    `Failed to migrate diagram "${diagram.name}": ${errorMsg}`
                );
            }
        }

        // Migrate config
        try {
            const configs: any[] = await (dexieDB as any).config.toArray();
            if (configs.length > 0) {
                const config = configs[0];
                await vertexApi.updateConfig({
                    default_diagram_id: config.defaultDiagramId,
                });
                console.log('✓ Migrated config');
            }
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : String(error);
            console.error('Error migrating config:', error);
            errors.push(`Failed to migrate config: ${errorMsg}`);
        }

        // Mark migration as complete
        localStorage.setItem(MIGRATION_FLAG, 'true');

        const result: MigrationResult = {
            success: errors.length === 0,
            message:
                errors.length === 0
                    ? `Successfully migrated ${diagrams.length} diagrams`
                    : `Migrated ${diagrams.length} diagrams with ${errors.length} errors`,
            diagramsCount: diagrams.length,
            errors,
        };

        console.log('Migration complete:', result);
        return result;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Fatal migration error:', error);
        return {
            success: false,
            message: `Migration failed: ${errorMsg}`,
            diagramsCount: 0,
            errors: [errorMsg],
        };
    }
}

/**
 * Check if migration has already been completed
 */
export function isMigrationComplete(): boolean {
    return localStorage.getItem(MIGRATION_FLAG) === 'true';
}

/**
 * Reset migration flag (for testing/debugging)
 */
export function resetMigrationFlag(): void {
    localStorage.removeItem(MIGRATION_FLAG);
}
