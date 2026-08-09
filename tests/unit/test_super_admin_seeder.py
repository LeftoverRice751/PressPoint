from unittest.mock import Mock

from tests import TestCase

from databases.seeds.super_admin_table_seeder import (
    DEFAULT_EMAIL,
    DEFAULT_USERNAME,
    find_existing,
    resolve_credentials,
)


def _user(username, email):
    user = Mock()
    user.username = username
    user.email = email
    return user


class ResolveCredentialsTestCase(TestCase):
    def test_falls_back_to_defaults_with_an_empty_environment(self):
        username, email, password, was_generated = resolve_credentials(env={})

        self.assertEqual(username, DEFAULT_USERNAME)
        self.assertEqual(email, DEFAULT_EMAIL)
        self.assertTrue(was_generated)
        self.assertTrue(password)

    def test_generated_passwords_are_not_reused(self):
        _, _, first, _ = resolve_credentials(env={})
        _, _, second, _ = resolve_credentials(env={})

        self.assertNotEqual(first, second)

    def test_environment_values_win(self):
        username, email, password, was_generated = resolve_credentials(
            env={
                "SUPER_ADMIN_USERNAME": "  boss  ",
                "SUPER_ADMIN_EMAIL": "  BOSS@Example.COM ",
                "SUPER_ADMIN_PASSWORD": " s3cret ",
            }
        )

        self.assertEqual(username, "boss")
        self.assertEqual(email, "boss@example.com")
        self.assertEqual(password, "s3cret")
        self.assertFalse(was_generated)

    def test_blank_password_still_generates_one(self):
        _, _, password, was_generated = resolve_credentials(
            env={"SUPER_ADMIN_PASSWORD": "   "}
        )

        self.assertTrue(was_generated)
        self.assertTrue(password.strip())


class FindExistingTestCase(TestCase):
    def test_matches_on_username_ignoring_case(self):
        users = [_user("SuperAdmin", "other@example.com")]

        self.assertIsNotNone(find_existing(users, "superadmin", "new@example.com"))

    def test_matches_on_email_ignoring_case_and_padding(self):
        users = [_user("someone", "  Boss@Example.com ")]

        self.assertIsNotNone(find_existing(users, "unique-name", "boss@example.com"))

    def test_returns_none_when_nothing_collides(self):
        users = [_user("ann", "ann@example.com"), _user("ed", "ed@example.com")]

        self.assertIsNone(find_existing(users, "superadmin", "superadmin@example.com"))

    def test_handles_an_empty_table(self):
        self.assertIsNone(find_existing([], "superadmin", "superadmin@example.com"))
        self.assertIsNone(find_existing(None, "superadmin", "superadmin@example.com"))
