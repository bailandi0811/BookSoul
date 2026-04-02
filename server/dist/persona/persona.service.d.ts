export interface Persona {
    role: string;
    style: string;
    instruction: string;
}
export declare class PersonaService {
    private readonly personas;
    getPersona(name: string): Persona;
    getAllPersonaNames(): string[];
    getPersonaPrompt(name: string): string;
}
