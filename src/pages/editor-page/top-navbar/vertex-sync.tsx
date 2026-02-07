import { Button } from '@/components/button/button';
import { useToast } from '@/components/toast/use-toast';
import { useChartDB } from '@/hooks/use-chartdb';
import { vertexApi } from '@/lib/vertex-api';
import { CloudUpload, Loader2 } from 'lucide-react';
import React, { useCallback, useState } from 'react';

export const VertexSync: React.FC = () => {
    const {
        currentDiagram,
        tables,
        relationships,
        areas,
        customTypes,
        notes,
        dependencies,
    } = useChartDB();
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleSync = useCallback(async () => {
        setIsLoading(true);
        try {
            // Prepare the full diagram data
            const fullDiagram = {
                ...currentDiagram,
                tables,
                relationships,
                areas,
                customTypes,
                notes,
                dependencies,
            };

            const vertexData = {
                name: currentDiagram.name || 'Untitled Diagram',
                content: fullDiagram,
            };

            const result = await vertexApi.saveDiagram(vertexData);

            toast({
                title: 'Synced to Vertex',
                description: `Diagram "${result.name}" saved to MongoDB.`,
            });
        } catch (error: unknown) {
            toast({
                title: 'Sync Failed',
                description:
                    error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    }, [
        currentDiagram,
        tables,
        relationships,
        areas,
        customTypes,
        notes,
        dependencies,
        toast,
    ]);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={handleSync}
            disabled={isLoading}
            title="Sync to Vertex (MongoDB)"
        >
            {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
            ) : (
                <CloudUpload className="size-4" />
            )}
        </Button>
    );
};
