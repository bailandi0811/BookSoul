export interface ResolvedTemplate {
    content: string;
    metadata?: Record<string, any>;
}
export interface TemplateResolver {
    resolve(templateName: string, context?: Record<string, any>): Promise<ResolvedTemplate>;
}
