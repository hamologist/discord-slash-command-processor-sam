import AJV, { JSONSchemaType } from 'ajv';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sign } from 'tweetnacl';
import axios from 'axios';
import { rollProcessor } from './roll-processor';

const ajv = new AJV();

interface Interaction {
    data: {
        id: string;
        name: string;
        options: Array<{
            name: string;
            value: string;
        }>;
    } | undefined;
    type: number;
}

export const lambdaHandler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    const schema: JSONSchemaType<Interaction> = {
        type: 'object',
        properties: {
            type: { type: 'integer' },
            data: {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
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
                nullable: true,
            }
        },
        required: ['type'],
    }
    if (event.body === null) {
        throw Error('Event missing body');
    }

    const body = JSON.parse(event.body);
    const validate = ajv.compile(schema);

    if (!validate(body)) {
        throw new Error(validate.errors!.join(', '));
    }

    for (const [key, value] of Object.entries(event.headers)) {
        event.headers[key.toLowerCase()] = value;
    }

    const signature = event.headers['x-signature-ed25519'];
    const timestamp = event.headers['x-signature-timestamp']
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

    if (body.data === undefined) {
        return {
            statusCode: 200,
            body: JSON.stringify({
                type: 4,
                data: {
                    content: 'Something went wrong.',
                    flags: 1<<6,
                }
            })
        }
    }

    let responseData: {
        content: string,
        flags?: number,
    }

    if (body.data.name === 'emojify') {
        const emojifyEndpoint = process.env.EMOJIFY_ENDPOINT;
        if (emojifyEndpoint === undefined) {
            throw new Error('Server not properly configured');
        }

        const emojifyResponse = await axios.post(emojifyEndpoint, {
            message: body.data.options[0].value
        });
        responseData = { content: emojifyResponse.data.message };
    }
    else if (body.data.name === 'roll') {
        responseData = await rollProcessor(body.data.options[0].value);
    }
    else {
        responseData = { content: 'Unknown slash command', flags: 1<<6 }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            type: 4,
            data: responseData
        }),
    };
};
