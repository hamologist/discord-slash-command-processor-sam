import AJV, { JSONSchemaType } from 'ajv';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { sign } from 'tweetnacl';
import { UnverifiedInteraction } from './types/interaction';
import { InvocationType, InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';

const ajv = new AJV();

export const lambdaHandler = async (
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
    const schema: JSONSchemaType<UnverifiedInteraction> = {
        type: 'object',
        properties: {
            type: { type: 'integer' },
            token: { type: 'string' },
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
        required: ['type', 'token'],
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

    if (!signature || !timestamp) {
        throw new Error('Missing expected headers');
    }

    if (!discordPublicKey) {
        console.log('Missing Environment Variable: DISCORD_PUBLIC_KEY');
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

    const commandRouterFunctionName = process.env.COMMAND_ROUTER_FUNCTION_NAME;
    if (!commandRouterFunctionName) {
        console.log('Missing Environment Variable: COMMAND_ROUTER_FUNCTION_NAME');
        throw new Error('Server not properly configured');
    }

    const client = new LambdaClient({});
    await client.send(new InvokeCommand({
        FunctionName: commandRouterFunctionName,
        InvocationType: InvocationType.Event,
        Payload: new TextEncoder().encode(JSON.stringify(body)),
    }));

    return {
        statusCode: 200,
        body: JSON.stringify({
            type: 5,
        }),
    };
};
