import { beforeEach, describe, expect, it, vi } from 'vitest';

const tauriMock = vi.hoisted(() => ({
    app: {
        VrchatGroupGet: vi.fn()
    }
}));

vi.mock('@/platform/tauri/client', () => ({
    tauriClient: tauriMock,
    default: tauriMock
}));

import groupProfileRepository, { normalize } from './groupProfileRepository';

describe('GroupProfileRepository', () => {
    beforeEach(() => {
        for (const command of Object.values(tauriMock.app)) {
            command.mockReset();
            command.mockResolvedValue({
                status: 200,
                data: '{"ok":true}',
                raw: {}
            });
        }
    });

    it('normalizes group profile fields, counts, roles, and public group URL', () => {
        expect(
            normalize({
                groupId: ' grp_123 ',
                name: ' Test Group ',
                description: '  Description  ',
                rules: '  Rules  ',
                shortCode: 'VRCX',
                discriminator: '1234',
                bannerUrl: ' banner.png ',
                iconUrl: ' icon.png ',
                memberCount: '42',
                onlineMemberCount: '7',
                ownerId: ' usr_owner ',
                privacy: ' public ',
                membershipStatus: ' member ',
                languages: [' eng ', '', null],
                links: [' https://example.test ', undefined],
                tags: [' tag ', ''],
                roles: [
                    {
                        id: ' role_1 ',
                        name: ' Admin ',
                        description: ' Full access ',
                        permissions: [' group-members-manage ', null, '']
                    },
                    null
                ]
            })
        ).toMatchObject({
            id: 'grp_123',
            name: 'Test Group',
            description: 'Description',
            rules: 'Rules',
            shortCode: 'VRCX',
            discriminator: '1234',
            url: 'https://vrc.group/VRCX.1234',
            bannerUrl: 'banner.png',
            iconUrl: 'icon.png',
            memberCount: 42,
            onlineMemberCount: 7,
            ownerId: 'usr_owner',
            privacy: 'public',
            membershipStatus: 'member',
            languages: ['eng'],
            links: ['https://example.test'],
            tags: ['tag'],
            roles: [
                {
                    id: 'role_1',
                    name: 'Admin',
                    description: 'Full access',
                    permissions: ['group-members-manage']
                }
            ]
        });
    });

    it('unwraps string error bodies from failed group requests', async () => {
        tauriMock.app.VrchatGroupGet.mockResolvedValue({
            status: 403,
            data: '"Forbidden"',
            raw: {}
        });

        await expect(
            groupProfileRepository.getGroupProfile({
                groupId: 'grp_123',
                force: true
            })
        ).rejects.toMatchObject({
            message: 'Forbidden',
            status: 403,
            endpoint: 'groups/grp_123',
            payload: 'Forbidden'
        });
    });
});
