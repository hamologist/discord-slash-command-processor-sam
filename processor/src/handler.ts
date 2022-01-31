import AJV, { JSONSchemaType } from 'ajv';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sign } from 'tweetnacl';

const ajv = new AJV();

interface Interaction {
    type: number;
}

interface InteractionWithData extends Interaction {
    data: {
        options: Array<{
            name: string;
            value: string;
        }>;
    };
}

export const lambdaHandler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    console.log(event.headers);
    console.log(JSON.parse(event.body!));
    const schema: JSONSchemaType<Interaction> = {
        type: 'object',
        properties: {
            type: { type: 'integer' },
        },
        required: ['type'],
    }
    const dataSchema: JSONSchemaType<InteractionWithData> = {
        type: 'object',
        properties: {
            type: { type: 'integer' },
            data: {
                type: 'object',
                properties: {
                    options: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                value: { type: 'string' },
                            },
                            required: ['name', 'value']
                        }
                    }
                },
                required: ['options'],
            }
        },
        required: ['type', 'data'],
    }
    if (event.body === null) {
        throw Error('Event missing body');
    }

    const body = JSON.parse(event.body);
    const validate = ajv.compile(schema);

    if (!validate(body)) {
        throw new Error(validate.errors!.join(', '));
    }

    const signature = event.headers['X-Signature-Ed25519'];
    const timestamp = event.headers['X-Signature-Timestamp']
    const discordPublicKey = process.env.DISCORD_PUBLIC_KEY;

    if (signature === undefined || timestamp === undefined) {
        throw new Error('Missing expected headers');
    }

    if (discordPublicKey === undefined) {
        throw new Error('Server not properly configured');
    }

    const isVerified = sign.detached.verify(
        Buffer.from(timestamp + event.body),
        Buffer.from(signature, 'hex'),
        Buffer.from(discordPublicKey, 'hex')
    )

    if (!isVerified) {
        return {
            statusCode: 401,
            body: 'bad signature',
        };
    }

    if (body.type === 1) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                type: 1
            }),
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello World!'
        }),
    };
};
