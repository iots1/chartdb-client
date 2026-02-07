import React, { useMemo } from 'react';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';
import { vertexApi } from '@/lib/vertex-api';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { ChartDBConfig } from '@/lib/domain/config';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import type { Note } from '@/lib/domain/note';
import { DatabaseType } from '@/lib/domain/database-type';
import type { DatabaseEdition } from '@/lib/domain/database-edition';

// Helper to normalize field types
function normalizeFieldType(type: unknown): { id: string; name: string } {
    if (!type) {
        return { id: 'string', name: 'string' }; // Default type
    }
    if (typeof type === 'string') {
        return { id: type, name: type };
    }
    return type as { id: string; name: string };
}

// Helper to normalize dependencies
function normalizeDependency(
    dep: Record<string, unknown>
): Record<string, unknown> {
    // Convert snake_case from API to camelCase for frontend
    const tableId = dep.tableId || dep.table_id;
    const dependentTableId = dep.dependentTableId || dep.dependent_table_id;
    const createdAt = dep.createdAt || dep.created_at;

    return {
        ...dep,
        tableId,
        dependentTableId,
        createdAt:
            typeof createdAt === 'number'
                ? createdAt
                : new Date(
                      (createdAt as string | number) || Date.now()
                  ).getTime(),
    };
}

// Helper to normalize relationship cardinalities
function normalizeRelationship(
    rel: Record<string, unknown>
): Record<string, unknown> {
    // Use relationship_id if id doesn't exist (from API)
    const relId = rel.id || rel.relationship_id;

    // Convert snake_case from API to camelCase for frontend
    const sourceTableId = rel.sourceTableId || rel.source_table_id;
    const targetTableId = rel.targetTableId || rel.target_table_id;
    const sourceFieldId = rel.sourceFieldId || rel.source_field_id;
    const targetFieldId = rel.targetFieldId || rel.target_field_id;

    // Default cardinalities to 'many' if not provided
    const sourceCardinality =
        rel.sourceCardinality || rel.source_cardinality || 'many';
    const targetCardinality =
        rel.targetCardinality || rel.target_cardinality || 'one';

    return {
        ...rel,
        id: relId,
        sourceTableId,
        targetTableId,
        sourceFieldId,
        targetFieldId,
        sourceCardinality,
        targetCardinality,
        createdAt:
            rel.createdAt && typeof rel.createdAt === 'number'
                ? rel.createdAt
                : rel.createdAt
                  ? new Date(rel.createdAt as string | number).getTime()
                  : Date.now(),
    };
}

// Helper to ensure diagram has all required fields
function normalizeDiagram(data: Record<string, unknown>, id: string): Diagram {
    const tables = ((data.tables as unknown) || []) as Array<{
        createdAt?: unknown;
        created_at?: unknown;
        isView?: unknown;
        is_view?: unknown;
        fields?: unknown[];
        [key: string]: unknown;
    }>;

    const normalizedTables = tables.map(
        (table: {
            createdAt?: unknown;
            created_at?: unknown;
            isView?: unknown;
            is_view?: unknown;
            fields?: unknown[];
            [key: string]: unknown;
        }) => {
            // Convert snake_case from API to camelCase for frontend
            const createdAt = table.createdAt || table.created_at;
            const isView =
                table.isView !== undefined
                    ? table.isView
                    : (table.is_view ?? false);

            return {
                ...table,
                createdAt:
                    typeof createdAt === 'number'
                        ? createdAt
                        : new Date(
                              (createdAt as string | number) || Date.now()
                          ).getTime(),
                isView,
                fields: ((table.fields as unknown as unknown[]) || []).map(
                    (field: unknown) => {
                        const fieldObj = field as Record<string, unknown>;
                        return {
                            ...fieldObj,
                            type: normalizeFieldType(fieldObj.type),
                        };
                    }
                ),
            };
        }
    ) as DBTable[];

    const relationships = (
        (data.relationships as unknown as
            | Record<string, unknown>[]
            | undefined) || []
    ).map(
        (rel: Record<string, unknown>) =>
            normalizeRelationship(rel) as unknown as DBRelationship
    );

    const dependencies = (
        (data.dependencies as unknown as
            | Record<string, unknown>[]
            | undefined) || []
    ).map(
        (dep: Record<string, unknown>) =>
            normalizeDependency(dep) as unknown as DBDependency
    );

    return {
        id: (data.id as string) || id,
        name: (data.name as string) || 'Untitled Diagram',
        databaseType:
            (data.databaseType as DatabaseType) || DatabaseType.GENERIC,
        databaseEdition: data.databaseEdition as DatabaseEdition | undefined,
        tables: normalizedTables,
        relationships,
        dependencies,
        areas: (data.areas as Area[] | undefined) || undefined,
        customTypes:
            (data.customTypes as DBCustomType[] | undefined) || undefined,
        notes: (data.notes as Note[] | undefined) || undefined,
        createdAt:
            data.createdAt instanceof Date
                ? data.createdAt
                : new Date((data.createdAt as string | number) || Date.now()),
        updatedAt:
            data.updatedAt instanceof Date
                ? data.updatedAt
                : new Date((data.updatedAt as string | number) || Date.now()),
    };
}

export const ApiStorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const storageContextValue = useMemo<StorageContext>(() => {
        return {
            // Config operations
            getConfig: async () => {
                try {
                    const config = await vertexApi.getConfig();
                    if (!config) return undefined;
                    return {
                        defaultDiagramId: config.default_diagram_id,
                    } as ChartDBConfig;
                } catch (error) {
                    console.error('Error getting config:', error);
                    return undefined;
                }
            },

            updateConfig: async (config: Partial<ChartDBConfig>) => {
                try {
                    await vertexApi.updateConfig({
                        default_diagram_id: config.defaultDiagramId,
                    });
                } catch (error) {
                    console.error('Error updating config:', error);
                    throw error;
                }
            },

            // Diagram filter operations
            getDiagramFilter: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    if (diagram.content?.diagramFilter) {
                        return diagram.content.diagramFilter as DiagramFilter;
                    }
                    return undefined;
                } catch (error) {
                    console.error('Error getting diagram filter:', error);
                    return undefined;
                }
            },

            updateDiagramFilter: async (
                diagramId: string,
                filter: DiagramFilter
            ) => {
                try {
                    console.log(
                        '📝 Updating diagram filter for:',
                        diagramId,
                        filter
                    );

                    // Check if filter has actual data
                    const hasData =
                        (filter.tableIds && filter.tableIds.length > 0) ||
                        (filter.schemaIds && filter.schemaIds.length > 0);

                    if (!hasData) {
                        console.log('  ℹ️  Filter is empty, skipping save');
                        return; // Skip save if filter is empty
                    }

                    const diagram = await vertexApi.getDiagram(diagramId);

                    if (!diagram.content) {
                        diagram.content = {};
                    }

                    const filterData: Record<string, unknown> = {};
                    if (filter.tableIds && filter.tableIds.length > 0) {
                        filterData.tableIds = filter.tableIds;
                    }
                    if (filter.schemaIds && filter.schemaIds.length > 0) {
                        filterData.schemaIds = filter.schemaIds;
                    }

                    diagram.content.diagramFilter = filterData;

                    console.log('💾 Saving diagram with filter:', diagram);
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error updating diagram filter:', error);
                    throw error;
                }
            },

            deleteDiagramFilter: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    // Only save if filter actually exists
                    if (diagram.content?.diagramFilter) {
                        delete diagram.content.diagramFilter;
                        await vertexApi.saveDiagram(diagram);
                    }
                } catch (error) {
                    console.error('Error deleting diagram filter:', error);
                    throw error;
                }
            },

            // Diagram operations
            addDiagram: async (params: { diagram: Diagram }) => {
                try {
                    const normalized = normalizeDiagram(
                        params.diagram as unknown as Record<string, unknown>,
                        params.diagram.id
                    );
                    const vertexDiagram = {
                        id: normalized.id,
                        name: normalized.name,
                        content: normalized as unknown as Record<
                            string,
                            unknown
                        >,
                    };
                    await vertexApi.saveDiagram(vertexDiagram);
                } catch (error) {
                    console.error('Error adding diagram:', error);
                    throw error;
                }
            },

            listDiagrams: async (options?: { includeTables?: boolean }) => {
                try {
                    const diagrams = await vertexApi.listDiagrams();

                    // If includeTables is requested, fetch full diagram data for table counts
                    if (options?.includeTables) {
                        return Promise.all(
                            diagrams.map(async (d) => {
                                try {
                                    // Fetch full diagram data to get table information
                                    const fullDiagram =
                                        await vertexApi.getDiagram(d.id || '');
                                    const content = fullDiagram.content || {};
                                    return normalizeDiagram(
                                        {
                                            ...content,
                                            id: fullDiagram.id,
                                            name: fullDiagram.name,
                                            createdAt: fullDiagram.created_at,
                                            updatedAt: fullDiagram.updated_at,
                                        },
                                        fullDiagram.id || ''
                                    );
                                } catch (error) {
                                    // Fallback to basic diagram if fetch fails
                                    console.error(
                                        `Error fetching full diagram ${d.id}:`,
                                        error
                                    );
                                    const content = d.content || {};
                                    return normalizeDiagram(
                                        {
                                            ...content,
                                            id: d.id,
                                            name: d.name,
                                            createdAt: d.created_at,
                                            updatedAt: d.updated_at,
                                        },
                                        d.id || ''
                                    );
                                }
                            })
                        );
                    }

                    // Default behavior - return diagrams with metadata only
                    return diagrams.map((d) => {
                        const content = d.content || {};
                        return normalizeDiagram(
                            {
                                ...content,
                                id: d.id,
                                name: d.name,
                                createdAt: d.created_at,
                                updatedAt: d.updated_at,
                            },
                            d.id || ''
                        );
                    });
                } catch (error) {
                    console.error('Error listing diagrams:', error);
                    return [];
                }
            },

            getDiagram: async (id: string) => {
                try {
                    const vertexDiagram = await vertexApi.getDiagram(id);
                    const content = vertexDiagram.content || {};
                    return normalizeDiagram(
                        {
                            ...content,
                            id: vertexDiagram.id,
                            name: vertexDiagram.name,
                            createdAt: vertexDiagram.created_at,
                            updatedAt: vertexDiagram.updated_at,
                        },
                        id
                    );
                } catch (error) {
                    console.error('Error getting diagram:', error);
                    return undefined;
                }
            },

            updateDiagram: async (params: {
                id: string;
                attributes: Partial<Diagram>;
            }) => {
                try {
                    const vertexDiagram = await vertexApi.getDiagram(params.id);
                    const content = vertexDiagram.content || {};
                    const current = normalizeDiagram(
                        {
                            ...content,
                            id: vertexDiagram.id,
                            name: vertexDiagram.name,
                            createdAt: vertexDiagram.created_at,
                            updatedAt: vertexDiagram.updated_at,
                        },
                        params.id
                    );

                    const updated = normalizeDiagram(
                        {
                            ...current,
                            ...params.attributes,
                            id: params.id,
                        },
                        params.id
                    );

                    await vertexApi.saveDiagram({
                        id: updated.id,
                        name: updated.name,
                        content: updated as unknown as Record<string, unknown>,
                    });
                } catch (error) {
                    console.error('Error updating diagram:', error);
                    throw error;
                }
            },

            deleteDiagram: async (id: string) => {
                try {
                    await vertexApi.deleteDiagram(id);
                } catch (error) {
                    console.error('Error deleting diagram:', error);
                    throw error;
                }
            },

            // Table operations
            addTable: async (params: { diagramId: string; table: DBTable }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    const tables = diagram.content?.tables as unknown as
                        | DBTable[]
                        | undefined;
                    if (!tables) {
                        diagram.content.tables = [];
                    }
                    (diagram.content.tables as unknown as DBTable[]).push(
                        params.table
                    );
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error adding table:', error);
                    throw error;
                }
            },

            getTable: async (params: { diagramId: string; id: string }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const tables = diagram.content?.tables as unknown as
                        | DBTable[]
                        | undefined;
                    const table = tables?.find(
                        (t: DBTable) => t.id === params.id
                    );
                    return table;
                } catch (error) {
                    console.error('Error getting table:', error);
                    return undefined;
                }
            },

            updateTable: async (params: {
                id: string;
                attributes: Partial<DBTable>;
            }) => {
                try {
                    // This operation needs the diagramId to fetch and update the correct diagram
                    // Since we don't have it in this signature, we need to search all diagrams
                    // This is inefficient but necessary without context about which diagram owns the table
                    const diagrams = await vertexApi.listDiagrams();

                    for (const diagramData of diagrams) {
                        const diagram = await vertexApi.getDiagram(
                            diagramData.id || ''
                        );
                        const tables =
                            (diagram.content?.tables as unknown as
                                | DBTable[]
                                | undefined) || [];
                        const tableIndex = tables.findIndex(
                            (t: DBTable) => t.id === params.id
                        );

                        if (tableIndex !== -1) {
                            // Found the table, update it
                            tables[tableIndex] = {
                                ...tables[tableIndex],
                                ...params.attributes,
                            };
                            if (diagram.content) {
                                diagram.content.tables = tables;
                            }
                            await vertexApi.saveDiagram(diagram);
                            return;
                        }
                    }

                    throw new Error(
                        `Table with id ${params.id} not found in any diagram`
                    );
                } catch (error) {
                    console.error('Error updating table:', error);
                    throw error;
                }
            },

            putTable: async (params: { diagramId: string; table: DBTable }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    const tables =
                        (diagram.content?.tables as unknown as
                            | DBTable[]
                            | undefined) || [];
                    const index = tables.findIndex(
                        (t: DBTable) => t.id === params.table.id
                    );
                    if (index >= 0) {
                        tables[index] = params.table;
                    } else {
                        tables.push(params.table);
                    }
                    diagram.content.tables = tables;
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error putting table:', error);
                    throw error;
                }
            },

            deleteTable: async (params: { diagramId: string; id: string }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const tables = diagram.content?.tables as unknown as
                        | DBTable[]
                        | undefined;
                    if (tables && diagram.content) {
                        diagram.content.tables = tables.filter(
                            (t: DBTable) => t.id !== params.id
                        );
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting table:', error);
                    throw error;
                }
            },

            listTables: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    return (diagram.content?.tables || []) as DBTable[];
                } catch (error) {
                    console.error('Error listing tables:', error);
                    return [];
                }
            },

            deleteDiagramTables: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    diagram.content.tables = [];
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting diagram tables:', error);
                    throw error;
                }
            },

            // Relationship operations
            addRelationship: async (params: {
                diagramId: string;
                relationship: DBRelationship;
            }) => {
                try {
                    console.log('📝 addRelationship:', {
                        sourceTableId: params.relationship.sourceTableId,
                        targetTableId: params.relationship.targetTableId,
                        sourceFieldId: params.relationship.sourceFieldId,
                        targetFieldId: params.relationship.targetFieldId,
                        name: params.relationship.name,
                    });

                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    if (!diagram.content.relationships) {
                        diagram.content.relationships = [];
                    }
                    (
                        diagram.content
                            .relationships as unknown as DBRelationship[]
                    ).push(params.relationship);
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error adding relationship:', error);
                    throw error;
                }
            },

            getRelationship: async (params: {
                diagramId: string;
                id: string;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const rels = diagram.content?.relationships as unknown as
                        | DBRelationship[]
                        | undefined;
                    const relationship = rels?.find(
                        (r: DBRelationship) => r.id === params.id
                    );
                    return relationship;
                } catch (error) {
                    console.error('Error getting relationship:', error);
                    return undefined;
                }
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            updateRelationship: async (_params) => {
                try {
                    throw new Error(
                        'updateRelationship requires diagramId - use the full workflow'
                    );
                } catch (error) {
                    console.error('Error updating relationship:', error);
                    throw error;
                }
            },

            deleteRelationship: async (params: {
                diagramId: string;
                id: string;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const rels = diagram.content?.relationships as unknown as
                        | DBRelationship[]
                        | undefined;
                    if (rels && diagram.content) {
                        diagram.content.relationships = rels.filter(
                            (r: DBRelationship) => r.id !== params.id
                        );
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting relationship:', error);
                    throw error;
                }
            },

            listRelationships: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    return (diagram.content?.relationships ||
                        []) as DBRelationship[];
                } catch (error) {
                    console.error('Error listing relationships:', error);
                    return [];
                }
            },

            deleteDiagramRelationships: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    if (diagram.content) {
                        diagram.content.relationships = [];
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error(
                        'Error deleting diagram relationships:',
                        error
                    );
                    throw error;
                }
            },

            // Dependency operations
            addDependency: async (params: {
                diagramId: string;
                dependency: DBDependency;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    if (!diagram.content.dependencies) {
                        diagram.content.dependencies = [];
                    }
                    (
                        diagram.content
                            .dependencies as unknown as DBDependency[]
                    ).push(params.dependency);
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error adding dependency:', error);
                    throw error;
                }
            },

            getDependency: async (params: {
                diagramId: string;
                id: string;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const deps = diagram.content?.dependencies as unknown as
                        | DBDependency[]
                        | undefined;
                    const dependency = deps?.find(
                        (d: DBDependency) => d.id === params.id
                    );
                    return dependency;
                } catch (error) {
                    console.error('Error getting dependency:', error);
                    return undefined;
                }
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            updateDependency: async (_params) => {
                try {
                    throw new Error(
                        'updateDependency requires diagramId - use the full workflow'
                    );
                } catch (error) {
                    console.error('Error updating dependency:', error);
                    throw error;
                }
            },

            deleteDependency: async (params: {
                diagramId: string;
                id: string;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const deps = diagram.content?.dependencies as unknown as
                        | DBDependency[]
                        | undefined;
                    if (deps && diagram.content) {
                        diagram.content.dependencies = deps.filter(
                            (d: DBDependency) => d.id !== params.id
                        );
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting dependency:', error);
                    throw error;
                }
            },

            listDependencies: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    return (diagram.content?.dependencies ||
                        []) as DBDependency[];
                } catch (error) {
                    console.error('Error listing dependencies:', error);
                    return [];
                }
            },

            deleteDiagramDependencies: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    if (diagram.content) {
                        diagram.content.dependencies = [];
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error(
                        'Error deleting diagram dependencies:',
                        error
                    );
                    throw error;
                }
            },

            // Area operations
            addArea: async (params: { diagramId: string; area: Area }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    if (!diagram.content.areas) {
                        diagram.content.areas = [];
                    }
                    (diagram.content.areas as unknown as Area[]).push(
                        params.area
                    );
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error adding area:', error);
                    throw error;
                }
            },

            getArea: async (params: { diagramId: string; id: string }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const areas = diagram.content?.areas as unknown as
                        | Area[]
                        | undefined;
                    const area = areas?.find((a: Area) => a.id === params.id);
                    return area;
                } catch (error) {
                    console.error('Error getting area:', error);
                    return undefined;
                }
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            updateArea: async (_params) => {
                try {
                    throw new Error(
                        'updateArea requires diagramId - use the full workflow'
                    );
                } catch (error) {
                    console.error('Error updating area:', error);
                    throw error;
                }
            },

            deleteArea: async (params: { diagramId: string; id: string }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const areas = diagram.content?.areas as unknown as
                        | Area[]
                        | undefined;
                    if (areas && diagram.content) {
                        diagram.content.areas = areas.filter(
                            (a: Area) => a.id !== params.id
                        );
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting area:', error);
                    throw error;
                }
            },

            listAreas: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    return (diagram.content?.areas || []) as Area[];
                } catch (error) {
                    console.error('Error listing areas:', error);
                    return [];
                }
            },

            deleteDiagramAreas: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    if (diagram.content) {
                        diagram.content.areas = [];
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting diagram areas:', error);
                    throw error;
                }
            },

            // Custom type operations
            addCustomType: async (params: {
                diagramId: string;
                customType: DBCustomType;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    if (!diagram.content.customTypes) {
                        diagram.content.customTypes = [];
                    }
                    (
                        diagram.content.customTypes as unknown as DBCustomType[]
                    ).push(params.customType);
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error adding custom type:', error);
                    throw error;
                }
            },

            getCustomType: async (params: {
                diagramId: string;
                id: string;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const customTypes = diagram.content
                        ?.customTypes as unknown as DBCustomType[] | undefined;
                    const customType = customTypes?.find(
                        (ct: DBCustomType) => ct.id === params.id
                    );
                    return customType;
                } catch (error) {
                    console.error('Error getting custom type:', error);
                    return undefined;
                }
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            updateCustomType: async (_params) => {
                try {
                    throw new Error(
                        'updateCustomType requires diagramId - use the full workflow'
                    );
                } catch (error) {
                    console.error('Error updating custom type:', error);
                    throw error;
                }
            },

            deleteCustomType: async (params: {
                diagramId: string;
                id: string;
            }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const customTypes = diagram.content
                        ?.customTypes as unknown as DBCustomType[] | undefined;
                    if (customTypes && diagram.content) {
                        diagram.content.customTypes = customTypes.filter(
                            (ct: DBCustomType) => ct.id !== params.id
                        );
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting custom type:', error);
                    throw error;
                }
            },

            listCustomTypes: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    return (diagram.content?.customTypes ||
                        []) as DBCustomType[];
                } catch (error) {
                    console.error('Error listing custom types:', error);
                    return [];
                }
            },

            deleteDiagramCustomTypes: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    if (diagram.content) {
                        diagram.content.customTypes = [];
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error(
                        'Error deleting diagram custom types:',
                        error
                    );
                    throw error;
                }
            },

            // Note operations
            addNote: async (params: { diagramId: string; note: Note }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    if (!diagram.content) {
                        diagram.content = {};
                    }
                    if (!diagram.content.notes) {
                        diagram.content.notes = [];
                    }
                    (diagram.content.notes as unknown as Note[]).push(
                        params.note
                    );
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error adding note:', error);
                    throw error;
                }
            },

            getNote: async (params: { diagramId: string; id: string }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const notes = diagram.content?.notes as unknown as
                        | Note[]
                        | undefined;
                    const note = notes?.find((n: Note) => n.id === params.id);
                    return note;
                } catch (error) {
                    console.error('Error getting note:', error);
                    return undefined;
                }
            },

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            updateNote: async (_params) => {
                try {
                    throw new Error(
                        'updateNote requires diagramId - use the full workflow'
                    );
                } catch (error) {
                    console.error('Error updating note:', error);
                    throw error;
                }
            },

            deleteNote: async (params: { diagramId: string; id: string }) => {
                try {
                    const diagram = await vertexApi.getDiagram(
                        params.diagramId
                    );
                    const notes = diagram.content?.notes as unknown as
                        | Note[]
                        | undefined;
                    if (notes && diagram.content) {
                        diagram.content.notes = notes.filter(
                            (n: Note) => n.id !== params.id
                        );
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting note:', error);
                    throw error;
                }
            },

            listNotes: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    return (diagram.content?.notes as unknown as Note[]) || [];
                } catch (error) {
                    console.error('Error listing notes:', error);
                    return [];
                }
            },

            deleteDiagramNotes: async (diagramId: string) => {
                try {
                    const diagram = await vertexApi.getDiagram(diagramId);
                    if (diagram.content) {
                        diagram.content.notes = [];
                    }
                    await vertexApi.saveDiagram(diagram);
                } catch (error) {
                    console.error('Error deleting diagram notes:', error);
                    throw error;
                }
            },
        };
    }, []);

    return (
        <storageContext.Provider value={storageContextValue}>
            {children}
        </storageContext.Provider>
    );
};
