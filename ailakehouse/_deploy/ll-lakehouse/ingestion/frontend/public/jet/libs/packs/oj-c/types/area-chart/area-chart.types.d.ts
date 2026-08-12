/**
 * @license
 * Copyright (c) %FIRST_YEAR% %CURRENT_YEAR%, Oracle and/or its affiliates.
 * The Universal Permissive License (UPL), Version 1.0
 * as shown at https://oss.oracle.com/licenses/upl/
 * @ignore
 */
import { AreaChartItemImplProps } from '../area-chart-item/area-chart-item';
import { Group, ReferenceObjectData } from '@oracle/oraclejet-preact/utils/UNSAFE_visTypes/chart';
import { AreaChartSeriesProps } from '../area-chart-series/area-chart-series';
import { type ContextMenuConfig, type ContextMenuSelectionDetail, type ContextMenuActionDetail } from 'oj-c/hooks/PRIVATE_useVisContextMenu/useVisContextMenu';
import { ColorProps } from '@oracle/oraclejet-preact/utils/UNSAFE_interpolations/colors';
export type AreaChartContextMenuConfig<K, D> = ContextMenuConfig<AreaContextMenuContext<K, D>>;
export type AreaChartContextMenuSelectionDetail<K, D> = ContextMenuSelectionDetail<AreaContextMenuContext<K, D>>;
export type AreaChartContextMenuActionDetail<K, D> = ContextMenuActionDetail<AreaContextMenuContext<K, D>>;
/** @deprecated since 19.0.0 - use 'CAreaChartElement.&lt;event-name&gt;[&apos;detail&apos;]' instead */
export type AreaChartContextMenuSelectionDetailDeprecated<K, D> = AreaChartContextMenuSelectionDetail<K, D>;
/** @deprecated since 19.0.0 - use 'CAreaChartElement.&lt;event-name&gt;[&apos;detail&apos;]' instead */
export type AreaChartContextMenuActionDetailDeprecated<K, D> = AreaChartContextMenuActionDetail<K, D>;
export type AreaContextMenuContext<K, D> = {
    /**
     * The shaped data of the item.
     */
    data?: AreaItem<K>;
    /**
     * The data of the item from the data provider.
     */
    itemData?: D;
    type: 'item';
} | {
    type: 'background';
} | {
    type: 'xAxisTickLabel';
    data: Group;
} | {
    type: 'series';
    data: AreaChartSeries<K>;
} | {
    type: 'axisTitle';
    axis: 'x' | 'y';
};
export type AreaItem<K> = {
    /**
     * @description
     * The item id should be set by the application if the DataProvider is not being used.
     * The row key will be used as id in the DataProvider case.
     */
    id: K;
} & AreaChartItemImplProps;
export type AreaChartSeries<K> = {
    id: string;
    items: AreaItem<K>[];
} & AreaChartSeriesProps;
export type StyleDefaults = {
    /**
     * An object defining the group separator lines in hierarchical axis.
     */
    groupSeparators?: {
        /**
         * Whether the group separator lines are rendered in hierarchical axis or not.
         * @ojmetadata description "Whether the group separator lines are rendered."
         */
        rendered?: 'auto' | 'off';
        /**
         * The color of the group separator lines.
         * @ojmetadata description "The color of the group separator lines."
         * @ojmetadata format "color"
         */
        color?: ColorProps['color'];
    };
    /**
     * @description
     * The shape of the data markers. In addition to the built-in shapes, it may also take SVG path commands to specify a custom shape. The chart will style the custom shapes the same way as built-in shapes, supporting properties like color and borderColor and applying hover and selection effects. Only 'auto' is supported for range series.
     * @ojmetadata description "The shape of the data markers."
     * @ojmetadata displayName "Marker Shape"
     * @ojmetadata help "#markerShape"
     * @ojmetadata propertyEditorValues {
     *     "circle": {
     *       "description": "Data markers will be circular in shape.",
     *       "displayName": "Circle"
     *     },
     *     "diamond": {
     *       "description": "Data markers will be diamond in shape.",
     *       "displayName": "Diamond"
     *     },
     *    "human": {
     *       "description": "Data markers will be human in shape.",
     *       "displayName": "Human"
     *    },
     *    "plus": {
     *       "description": "Data markers will be plus in shape.",
     *       "displayName": "Plus"
     *     },
     *     "square": {
     *       "description": "Data markers will be square in shape.",
     *       "displayName": "Square"
     *     },
     *     "star": {
     *       "description": "Data markers will be star in shape.",
     *       "displayName": "Star"
     *     },
     *     "triangleDown": {
     *       "description": "Data markers will be of a triangular shape facing down.",
     *       "displayName": "Triangle Down"
     *     },
     *     "triangleUp": {
     *       "description": "Data markers will be of a triangular shape facing up.",
     *       "displayName": "Triangle Up"
     *     },
     *     "auto": {
     *       "description": "Data marker shape will be based on chart type.",
     *       "displayName": "Auto"
     *     }
     *  }
     */
    markerShape?: 'circle' | 'diamond' | 'human' | 'plus' | 'square' | 'star' | 'triangleDown' | 'triangleUp' | 'auto';
    /**
     * @description
     * The color of the data markers, if different from the series color.
     * @ojmetadata description "The color of the data markers, if different from the series color."
     * @ojmetadata displayName "Marker Color"
     * @ojmetadata help "#markerColor"
     */
    markerColor?: string;
    /**
     * @description
     * The position of the data label.
     * @ojmetadata description "The position of the data label."
     * @ojmetadata displayName "Data Label Position"
     * @ojmetadata help "#dataLabelPosition"
     * @ojmetadata propertyEditorValues {
     *     "center": {
     *       "description": "Label will be placed in the center of the data marker.",
     *       "displayName": "Center"
     *     },
     *     "belowMarker": {
     *       "description": "Label will be placed below the data marker.",
     *       "displayName": "Below Marker"
     *     },
     *    "aboveMarker": {
     *       "description": "Label will be placed above the data marker.",
     *       "displayName": "Above Marker"
     *    },
     *    "beforeMarker": {
     *       "description": "Label will be placed before the data marker.",
     *       "displayName": "Before Marker"
     *     },
     *     "afterMarker": {
     *       "description": "Label will be placed after the data marker.",
     *       "displayName": "After Marker"
     *     }
     *  }
     */
    dataLabelPosition?: 'center' | 'belowMarker' | 'aboveMarker' | 'beforeMarker' | 'afterMarker';
};
export type ItemDrillDetail<K, D> = {
    /**
     * The id of the drilled object.
     * @ojmetadata description "The id of the drilled object."
     */
    id: K;
    /**
     * The series id of the drilled object.
     * @ojmetadata description "The series id of the drilled object."
     */
    series: K;
    /**
     * The group id of the drilled object.
     * @ojmetadata description "The group id of the drilled object."
     */
    group: K;
    /**
     * The data object of the drilled item.
     * @ojmetadata description "The data object of the drilled item."
     */
    data: AreaItem<K>;
    /**
     * The row data object of the drilled item. This will only be set if a DataProvider is being used.
     * @ojmetadata description "The row data object of the drilled item. This will only be set if a DataProvider is being used."
     */
    itemData: D;
    /**
     * The data for the series of the drilled object.
     * @ojmetadata description "The data for the series of the drilled object"
     */
    seriesData: AreaChartSeries<K>;
    /**
     * An array of data for the group the drilled object belongs to.
     * @ojmetadata description "An array of data for the group the drilled object belongs to."
     */
    groupData: Group;
};
export type SeriesDrillDetail<K> = {
    /**
     * The id of the drilled object.
     * @ojmetadata description "The id of the drilled object."
     */
    id: K;
    /**
     * The series id of the drilled object.
     * @ojmetadata description "The series id of the drilled object."
     */
    series: K;
    /**
     * The data for the series of the drilled object.
     * @ojmetadata description "The data for the series of the drilled object"
     */
    seriesData: AreaChartSeries<K>;
    /**
     * An array containing objects describing the data items belonging to the drilled group.
     * @ojmetadata description "An array containing objects describing the data items belonging to the drilled group."
     */
    items: AreaItem<K>[];
};
export type GroupDrillDetail<K> = {
    /**
     * The id of the drilled object.
     * @ojmetadata description "The id of the drilled object."
     */
    id: K;
    /**
     * The group id of the drilled object.
     * @ojmetadata description "The group id of the drilled object."
     */
    group: K;
    /**
     * An array of data for the group the drilled object belongs to.
     * @ojmetadata description "An array of data for the group the drilled object belongs to."
     */
    groupData: Group;
    /**
     * An array containing objects describing the data items belonging to the drilled group.
     * @ojmetadata description "An array containing objects describing the data items belonging to the drilled group."
     */
    items: AreaItem<K>[];
};
export type DatatipTemplateContext<K, D> = {
    /**
     * @description
     * The color of the item.
     */
    color?: string;
    /**
     * @description
     * The data object of the item.
     * For nested items, it will be an array containing the parent item data and nested item data.
     */
    data?: AreaItem<K> | ReferenceObjectData;
    /**
     * @description
     * The ids or an array of ids of the group(s) the item belongs to.
     * For hierarchical groups, it will be an array of outermost to innermost group ids.
     */
    group?: string | Array<string>;
    /**
     * @description
     * An array of data for the group the item belongs to.
     * For hierarchical groups, it will be an array of outermost to innermost group data related to the item.
     */
    groupData?: Group[];
    /**
     * @description
     * The id of the item.
     */
    id: K | string;
    /**
     * @description
     * The row data object for the item. This will only be set if a DataProvider is being used.
     */
    itemData?: D;
    /**
     * @description
     * The data label of the item.
     */
    label?: string;
    /**
     * @description
     * The id of the series the item belongs to.
     */
    series?: string;
    /**
     * @description
     * The data for the series that the item belongs to.
     */
    seriesData?: AreaChartSeries<K>;
    /**
     * @description
     * The value of the item.
     */
    value?: number;
    /**
     * @description
     * The high value of the data item.
     */
    high?: number;
    /**
     * @description
     * The high value of the data item.
     */
    low?: number;
};
/**
 * The DatatipStyle is used to specify datatip border color.
 * @ojmetadata description "The datatipTemplate slot is used to specify custom datatip content."
 */
export type DatatipStyle = {
    borderColor: ColorProps['color'];
};
export type DatatipConfig = {
    /**
     * @description
     * Defines if the datatip container is visually shown.
     * For applications requiring full control over the datatip's appearance, the defaultContainer should be set to "disabled".
     * In this mode, the content provided by the datatipTemplate slot takes up the whole datatip.
     * This only applies if a datatipTemplate slot is used.
     */
    defaultContainer: 'enabled' | 'disabled';
    /**
     * @description
     * Defines the style of the datatip container.
     */
    style?: DatatipStyle;
    /**
     * @description
     * Defines if the datatip is rendered.
     */
    rendered?: 'on' | 'off';
};
