interface Data {
    id: string;
    name: string;
    options: Array<{
        name: string;
        value: string;
    }>;
}

export interface UnverifiedInteraction {
    data: Data | undefined;
    type: number;
    token: string;
}

export interface VerifiedInteraction extends Omit<UnverifiedInteraction, 'data'> {
    data: Data
}
