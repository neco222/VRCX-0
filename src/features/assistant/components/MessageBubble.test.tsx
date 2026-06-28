import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { UIMessage } from '../assistantTypes';
import { MessageBubble } from './MessageBubble';

function assistantMessage(message: Partial<UIMessage>): UIMessage {
    return {
        id: 'asst_1',
        role: 'assistant',
        text: '',
        streaming: true,
        toolCalls: [],
        ...message
    };
}

describe('MessageBubble', () => {
    it('shows pending tool calls as the tool name followed by a spinner', () => {
        const html = renderToStaticMarkup(
            <MessageBubble
                message={assistantMessage({
                    toolCalls: [
                        {
                            id: 'tool_1',
                            name: 'get_friend_profile',
                            args: '{}',
                            status: 'pending',
                            summary: '',
                            entities: []
                        }
                    ]
                })}
            />
        );

        expect(html).toContain('Get friend profile');
        expect(html).toContain('animate-spin');
        expect(html).not.toContain('Calling');
    });

    it('renders the tool-only streaming cursor after tool calls', () => {
        const html = renderToStaticMarkup(
            <MessageBubble
                message={assistantMessage({
                    toolCalls: [
                        {
                            id: 'tool_1',
                            name: 'get_friend_profile',
                            args: '{}',
                            status: 'pending',
                            summary: '',
                            entities: []
                        }
                    ]
                })}
            />
        );

        expect(html).toContain('animate-pulse');
        expect(html.indexOf('Get friend profile')).toBeLessThan(
            html.indexOf('animate-pulse')
        );
    });

    it('keeps the streaming cursor when assistant text is visible', () => {
        const html = renderToStaticMarkup(
            <MessageBubble
                message={assistantMessage({
                    text: 'Reading local social data'
                })}
            />
        );

        expect(html).toContain('Reading local social data');
        expect(html).toContain('animate-pulse');
    });

    it('keeps tool calls before assistant text so the cursor stays below tools', () => {
        const html = renderToStaticMarkup(
            <MessageBubble
                message={assistantMessage({
                    text: 'Reading local social data',
                    toolCalls: [
                        {
                            id: 'tool_1',
                            name: 'get_friend_profile',
                            args: '{}',
                            status: 'pending',
                            summary: '',
                            entities: []
                        }
                    ]
                })}
            />
        );

        expect(html.indexOf('Get friend profile')).toBeLessThan(
            html.indexOf('Reading local social data')
        );
    });

    it('treats whitespace-only streaming text as a cursor below tools', () => {
        const html = renderToStaticMarkup(
            <MessageBubble
                message={assistantMessage({
                    text: '\n\n',
                    toolCalls: [
                        {
                            id: 'tool_1',
                            name: 'get_friend_profile',
                            args: '{}',
                            status: 'pending',
                            summary: '',
                            entities: []
                        }
                    ]
                })}
            />
        );

        expect(html).not.toContain('whitespace-pre-wrap');
        expect(html.indexOf('Get friend profile')).toBeLessThan(
            html.indexOf('animate-pulse')
        );
    });
});
