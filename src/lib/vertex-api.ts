const VERTEX_API_URL =
    import.meta.env.VITE_VERTEX_API_URL || 'http://localhost:8080/api';

export interface VertexDiagram {
    id?: string;
    name: string;
    content?: Record<string, unknown>;
    updated_at?: string;
    created_at?: string;
    tables?: unknown;
    relationships?: unknown;
    dependencies?: unknown;
    areas?: unknown;
    customTypes?: unknown;
    notes?: unknown;
}

export interface VertexConfig {
    id?: string;
    default_diagram_id?: string;
}

export const vertexApi = {
    async listDiagrams(): Promise<VertexDiagram[]> {
        const response = await fetch(`${VERTEX_API_URL}/diagrams`);
        if (!response.ok) throw new Error('Failed to fetch diagrams');
        return response.json();
    },

    async getDiagram(id: string): Promise<VertexDiagram> {
        const response = await fetch(`${VERTEX_API_URL}/diagrams/${id}`);
        if (!response.ok) throw new Error('Failed to fetch diagram');
        return response.json();
    },

    async saveDiagram(diagram: VertexDiagram): Promise<VertexDiagram> {
        const response = await fetch(`${VERTEX_API_URL}/diagrams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(diagram),
        });
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Save diagram error response:', errorData);
            throw new Error(
                `Failed to save diagram: ${response.status} - ${errorData}`
            );
        }
        return response.json();
    },

    async deleteDiagram(id: string): Promise<void> {
        const response = await fetch(`${VERTEX_API_URL}/diagrams/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete diagram');
    },

    async getConfig(): Promise<VertexConfig | null> {
        try {
            const response = await fetch(`${VERTEX_API_URL}/config`);
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error('Failed to fetch config');
            }
            return response.json();
        } catch (error) {
            console.error('Error fetching config:', error);
            return null;
        }
    },

    async updateConfig(config: VertexConfig): Promise<VertexConfig> {
        const response = await fetch(`${VERTEX_API_URL}/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
        });
        if (!response.ok) throw new Error('Failed to update config');
        return response.json();
    },
};
