import axios from 'axios';
import { rollProcessor } from './roll-processor';
import { VerifiedInteraction } from './types/interaction';

export const lambdaHandler = async (
    body: VerifiedInteraction
): Promise<void> => {
    let responseData: {
        content: string,
        flags?: number,
    }

    const discordApplicationId = process.env.DISCORD_APPLICATION_ID;
    if (!discordApplicationId) {
        console.log('Missing Environment Variable: DISCORD_APPLICATION_ID');
        throw new Error('Server not properly configured');
    }

    if (body.data.name === 'emojify') {
        const emojifyEndpoint = process.env.EMOJIFY_ENDPOINT;
        if (emojifyEndpoint === undefined) {
            console.log('Missing Environment Variable: EMOJIFY_ENDPOINT');
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

    if (!responseData.flags) {
        await axios.patch(
            `https://discord.com/api/v8/webhooks/${discordApplicationId}/${body.token}/messages/@original`,
            { content: responseData.content }
        );
    } else {
        await axios.delete(
            `https://discord.com/api/v8/webhooks/${discordApplicationId}/${body.token}/messages/@original`
        );
        await axios.post(
            `https://discord.com/api/v8/webhooks/${discordApplicationId}/${body.token}`,
            responseData
        )
    }
}
