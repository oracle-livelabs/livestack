export declare const pictoChartItemDefaults: {
    categories: never[];
    shape: "rectangle";
    drilling: "inherit";
};
export type PictoChartItemProps = {
    /**
     * @description
     * An array of category strings corresponding to the picto chart items. This allows highlighting and filtering of items.
     * @ojmetadata description "An array of category strings corresponding to the picto chart items."
     * @ojmetadata displayName "Categories"
     * @ojmetadata help "#categories"
     */
    categories?: string[];
    /**
     * @description
     * Whether drilling is enabled on the item. Drillable items will show a pointer cursor on hover and fire an ojDrill event on click (double click if selection is enabled). To enable drilling for all items at once, use the drilling attribute in the top level.
     * @ojmetadata description "Whether drilling is enabled on the item."
     * @ojmetadata displayName "Drilling"
     * @ojmetadata help "#drilling"
     */
    drilling?: 'inherit' | 'off' | 'on';
    /**
     * @description
     * The color of the item. Does not apply if custom image is specified.
     * @ojmetadata description "The color of the item. Does not apply if custom image is specified."
     * @ojmetadata displayName "Color"
     * @ojmetadata help "#color"
     */
    color?: string;
    /**
     * @description
     * The number of columns each shape (or custom image) spans. Used for creating a picto chart with mixed item sizes.
     * @ojmetadata description "The number of columns each shape (or custom image) spans. Used for creating a picto chart with mixed item sizes."
     * @ojmetadata displayName "Column Span"
     * @ojmetadata help "#columnSpan"
     */
    columnSpan?: string;
    /**
     * @description
     * Specifies the number of times that the shape (or custom image) is drawn.
     * @ojmetadata description "Specifies the number of times that the shape (or custom image) is drawn."
     * @ojmetadata displayName "Count"
     * @ojmetadata help "#count"
     */
    count?: string;
    /**
     * @description
     * The name of the item. Used for default tooltip and accessibility.
     * @ojmetadata description "The name of the item. Used for default tooltip and accessibility."
     * @ojmetadata displayName "Name"
     * @ojmetadata help "#name"
     */
    name?: string;
    /**
     * @description
     * The number of rows each shape (or custom image) spans. Used for creating a picto chart with mixed item sizes.
     * @ojmetadata description "The name of the item. Used for default tooltip and accessibility."
     * @ojmetadata displayName "Row Span"
     * @ojmetadata help "#rowSpan"
     */
    rowSpan?: string;
    /**
     * @description
     * The shape of the item. Can take the name of a built-in shape or the SVG path commands for a custom shape.
     * "None" will make the item transparent and can be used to create gaps. Does not apply if custom image is specified.
     * @ojmetadata description "The shape of the item. Can take the name of a built-in shape or the SVG path commands for a custom shape."
     * @ojmetadata displayName "Shape"
     * @ojmetadata help "#shape"
     */
    shape?: string;
    /**
     * @description
     * The description of the item. This is used for customizing the tooltip text.
     * @ojmetadata description "The description of the item. This is used for customizing the tooltip text."
     * @ojmetadata displayName "ShortDesc"
     * @ojmetadata help "#shortDesc"
     */
    shortDesc?: string;
};
/**
 * This export corresponds to the PictoChartItem Preact component. For the oj-c-picto-chart-item custom element, import CPictoChartItemElement instead.
 */
export declare const PictoChartItem: import("preact").ComponentType<import("ojs/ojvcomponent").ExtendGlobalProps<PictoChartItemProps>>;
import { JetElement, JetSettableProperties, JetElementCustomEventStrict, JetSetPropertyType } from 'ojs/index';
import { GlobalProps } from 'ojs/ojvcomponent';
import 'ojs/oj-jsx-interfaces';
/**
 * This export corresponds to the oj-c-picto-chart-item custom element. For the PictoChartItem Preact component, import PictoChartItem instead.
 */
export interface CPictoChartItemElement extends JetElement<CPictoChartItemElementSettableProperties>, CPictoChartItemElementSettableProperties {
    addEventListener<T extends keyof CPictoChartItemElementEventMap>(type: T, listener: (this: HTMLElement, ev: CPictoChartItemElementEventMap[T]) => any, options?: (boolean | AddEventListenerOptions)): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: (boolean | AddEventListenerOptions)): void;
    getProperty<T extends keyof CPictoChartItemElementSettableProperties>(property: T): CPictoChartItemElement[T];
    getProperty(property: string): any;
    setProperty<T extends keyof CPictoChartItemElementSettableProperties>(property: T, value: CPictoChartItemElementSettableProperties[T]): void;
    setProperty<T extends string>(property: T, value: JetSetPropertyType<T, CPictoChartItemElementSettableProperties>): void;
    setProperties(properties: CPictoChartItemElementSettablePropertiesLenient): void;
}
export namespace CPictoChartItemElement {
    type categoriesChanged = JetElementCustomEventStrict<CPictoChartItemElement['categories']>;
    type colorChanged = JetElementCustomEventStrict<CPictoChartItemElement['color']>;
    type columnSpanChanged = JetElementCustomEventStrict<CPictoChartItemElement['columnSpan']>;
    type countChanged = JetElementCustomEventStrict<CPictoChartItemElement['count']>;
    type drillingChanged = JetElementCustomEventStrict<CPictoChartItemElement['drilling']>;
    type nameChanged = JetElementCustomEventStrict<CPictoChartItemElement['name']>;
    type rowSpanChanged = JetElementCustomEventStrict<CPictoChartItemElement['rowSpan']>;
    type shapeChanged = JetElementCustomEventStrict<CPictoChartItemElement['shape']>;
    type shortDescChanged = JetElementCustomEventStrict<CPictoChartItemElement['shortDesc']>;
}
export interface CPictoChartItemElementEventMap extends HTMLElementEventMap {
    'categoriesChanged': JetElementCustomEventStrict<CPictoChartItemElement['categories']>;
    'colorChanged': JetElementCustomEventStrict<CPictoChartItemElement['color']>;
    'columnSpanChanged': JetElementCustomEventStrict<CPictoChartItemElement['columnSpan']>;
    'countChanged': JetElementCustomEventStrict<CPictoChartItemElement['count']>;
    'drillingChanged': JetElementCustomEventStrict<CPictoChartItemElement['drilling']>;
    'nameChanged': JetElementCustomEventStrict<CPictoChartItemElement['name']>;
    'rowSpanChanged': JetElementCustomEventStrict<CPictoChartItemElement['rowSpan']>;
    'shapeChanged': JetElementCustomEventStrict<CPictoChartItemElement['shape']>;
    'shortDescChanged': JetElementCustomEventStrict<CPictoChartItemElement['shortDesc']>;
}
export interface CPictoChartItemElementSettableProperties extends JetSettableProperties {
    /**
     * An array of category strings corresponding to the picto chart items. This allows highlighting and filtering of items.
     */
    categories?: PictoChartItemProps['categories'];
    /**
     * The color of the item. Does not apply if custom image is specified.
     */
    color?: PictoChartItemProps['color'];
    /**
     * The number of columns each shape (or custom image) spans. Used for creating a picto chart with mixed item sizes.
     */
    columnSpan?: PictoChartItemProps['columnSpan'];
    /**
     * Specifies the number of times that the shape (or custom image) is drawn.
     */
    count?: PictoChartItemProps['count'];
    /**
     * Whether drilling is enabled on the item. Drillable items will show a pointer cursor on hover and fire an ojDrill event on click (double click if selection is enabled). To enable drilling for all items at once, use the drilling attribute in the top level.
     */
    drilling?: PictoChartItemProps['drilling'];
    /**
     * The name of the item. Used for default tooltip and accessibility.
     */
    name?: PictoChartItemProps['name'];
    /**
     * The number of rows each shape (or custom image) spans. Used for creating a picto chart with mixed item sizes.
     */
    rowSpan?: PictoChartItemProps['rowSpan'];
    /**
     * The shape of the item. Can take the name of a built-in shape or the SVG path commands for a custom shape.
     * "None" will make the item transparent and can be used to create gaps. Does not apply if custom image is specified.
     */
    shape?: PictoChartItemProps['shape'];
    /**
     * The description of the item. This is used for customizing the tooltip text.
     */
    shortDesc?: PictoChartItemProps['shortDesc'];
}
export interface CPictoChartItemElementSettablePropertiesLenient extends Partial<CPictoChartItemElementSettableProperties> {
    [key: string]: any;
}
export interface PictoChartItemIntrinsicProps extends Partial<Readonly<CPictoChartItemElementSettableProperties>>, GlobalProps, Pick<preact.JSX.HTMLAttributes, 'ref' | 'key'> {
    oncategoriesChanged?: (value: CPictoChartItemElementEventMap['categoriesChanged']) => void;
    oncolorChanged?: (value: CPictoChartItemElementEventMap['colorChanged']) => void;
    oncolumnSpanChanged?: (value: CPictoChartItemElementEventMap['columnSpanChanged']) => void;
    oncountChanged?: (value: CPictoChartItemElementEventMap['countChanged']) => void;
    ondrillingChanged?: (value: CPictoChartItemElementEventMap['drillingChanged']) => void;
    onnameChanged?: (value: CPictoChartItemElementEventMap['nameChanged']) => void;
    onrowSpanChanged?: (value: CPictoChartItemElementEventMap['rowSpanChanged']) => void;
    onshapeChanged?: (value: CPictoChartItemElementEventMap['shapeChanged']) => void;
    onshortDescChanged?: (value: CPictoChartItemElementEventMap['shortDescChanged']) => void;
}
declare global {
    namespace preact.JSX {
        interface IntrinsicElements {
            'oj-c-picto-chart-item': PictoChartItemIntrinsicProps;
        }
    }
}
