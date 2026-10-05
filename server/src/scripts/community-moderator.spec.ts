import { parseModeratorArguments } from './community-moderator';
it('moderator_command_is_preview_by_default', () => {
  expect(
    parseModeratorArguments([
      '--member-id=b830361c-448c-403a-8ef0-e35fb4c2998c',
    ]),
  ).toEqual({ memberId: 'b830361c-448c-403a-8ef0-e35fb4c2998c', apply: false });
});
it('requires_one_exact_public_member_and_rejects_unknown_flags', () => {
  expect(() => parseModeratorArguments(['--apply'])).toThrow();
  expect(() => parseModeratorArguments(['--member-id=all'])).toThrow();
  expect(() =>
    parseModeratorArguments([
      '--member-id=b830361c-448c-403a-8ef0-e35fb4c2998c',
      '--all',
    ]),
  ).toThrow();
});
