export type AnalyticsEvent={name:string;properties?:Record<string,string|number|boolean>};
export function trackPageView(path:string){void path;/* Punto de integración futuro: no envía datos sin un proveedor autorizado. */}
export function trackEvent(event:AnalyticsEvent){void event;/* Punto de integración futuro. */}
