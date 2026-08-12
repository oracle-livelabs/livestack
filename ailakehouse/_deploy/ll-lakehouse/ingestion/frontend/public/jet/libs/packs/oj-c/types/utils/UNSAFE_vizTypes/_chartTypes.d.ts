export type BaseItem = {
    seriesId: string;
    groupId: Array<string>;
    value: number;
    x?: string;
    color?: string;
    categories?: string[];
    drilling?: 'on' | 'off' | 'inherit';
    shortDesc?: string;
};
export type MarkerItem = {
    markerDisplayed?: 'on' | 'off' | 'auto';
    markerShape?: 'circle' | 'diamond' | 'human' | 'plus' | 'square' | 'star' | 'triangleDown' | 'triangleUp' | 'auto';
    markerSize?: number;
};
