"""One-shot seeder for About LSPU sections + history milestones.

Idempotent: running twice will not duplicate rows — sections are upserted
on slug, and milestones are reseeded only if the table is empty.

Run with: python databases/seeds/seed_about_lspu.py
"""

import json
import os
import sys

# Allow `python databases/seeds/seed_about_lspu.py` from project root.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.models.AboutMilestone import AboutMilestone  # noqa: E402
from app.models.AboutSection import AboutSection  # noqa: E402


SECTIONS = [
    {
        "slug": "mission",
        "title": "Mission, Vision & Mandate",
        "body_html": None,
        "subsections": [
            {
                "heading": "Mission",
                "body_html": "<p>The Laguna State Polytechnic University is committed to provide quality and relevant education for lifelong learning, sustainable productivity and global competitiveness.</p>",
            },
            {
                "heading": "Vision",
                "body_html": "<p>A premier university in CALABARZON offering academic programs and related services designed to respond to the requirements of the Philippines and the global economy.</p>",
            },
            {
                "heading": "Mandate",
                "body_html": "<p>LSPU shall provide higher professional, technical and special instructions in the arts, sciences, humanities, and technology, and promote research, advanced studies, progressive leadership, and extension services.</p>",
            },
        ],
    },
    {
        "slug": "values",
        "title": "Group Values & Performance Pledge",
        "body_html": None,
        "subsections": [
            {
                "heading": "Group Values",
                "body_html": (
                    "<ul>"
                    "<li><strong>Excellence</strong> in everything we do.</li>"
                    "<li><strong>Integrity</strong> in our dealings.</li>"
                    "<li><strong>Service</strong> to our community.</li>"
                    "<li><strong>Innovation</strong> for the future.</li>"
                    "</ul>"
                ),
            },
            {
                "heading": "Performance Pledge",
                "body_html": "<p>We pledge to deliver quality education, uphold integrity in all transactions, and foster a culture of excellence, innovation, and service to the community.</p>",
            },
        ],
    },
    {
        "slug": "history",
        "title": "Historical Development",
        "body_html": "<p>From a single agricultural high school to a multi-campus polytechnic university — these are the milestones that shaped LSPU.</p>",
        "subsections": None,
    },
    {
        "slug": "quality",
        "title": "Quality Policy",
        "body_html": (
            "<p>The Laguna State Polytechnic University is committed to provide "
            "quality higher and advanced education, research, extension, and "
            "production services that consistently conform to customer requirements "
            "and applicable statutory and regulatory mandates through continual "
            "improvement of the Quality Management System.</p>"
        ),
        "subsections": None,
    },
    {
        "slug": "hymn",
        "title": "University Hymn",
        "body_html": (
            "<p>Hail, hail to thee, our Alma Mater dear<br>"
            "Laguna State Polytechnic University<br>"
            "Source of knowledge, wisdom, light and love<br>"
            "Forever we shall sing thy praise.</p>"
            "<p>With heads held high we'll bring thee honor and fame<br>"
            "Truth and excellence will guide our way<br>"
            "Loyal sons and daughters we shall be<br>"
            "LSPU, we pledge to thee.</p>"
        ),
        "subsections": None,
    },
    {
        "slug": "seal",
        "title": "University Seal",
        "body_html": (
            "<p>The University Seal embodies LSPU's commitment to academic excellence, "
            "service to community, and rootedness in the Laguna heritage. The torch "
            "represents enlightenment, the open book signifies knowledge, and the "
            "encircling laurel honors achievement and unity across all campuses.</p>"
        ),
        "subsections": None,
    },
]


MILESTONES = [
    ("1952", "Founding as Baybay Rural High School",
     "<p>Established as a rural high school serving the agricultural communities of southern Laguna.</p>"),
    ("1957", "Conversion to Baybay Agricultural School",
     "<p>Reorganized to focus on agricultural education and vocational training.</p>"),
    ("1983", "Becomes Laguna College of Arts and Trades",
     "<p>Expanded into arts, trades, and technology programs serving a broader student base.</p>"),
    ("2007", "Charter as Laguna State Polytechnic University",
     "<p>Republic Act No. 9402 elevated the institution to university status, integrating multiple campuses across Laguna.</p>"),
    ("Today", "A Multi-Campus Polytechnic University",
     "<p>LSPU continues to grow as a premier polytechnic university in CALABARZON, offering diverse programs in arts, sciences, technology, and education.</p>"),
]


def upsert_sections():
    for row in SECTIONS:
        subs = row["subsections"]
        existing = AboutSection.where("slug", row["slug"]).first()
        payload = {
            "slug": row["slug"],
            "title": row["title"],
            "body_html": row["body_html"],
            "subsections": json.dumps(subs) if subs is not None else None,
            "image_path": None,
        }
        if existing:
            existing.title = payload["title"]
            existing.body_html = payload["body_html"]
            existing.subsections = payload["subsections"]
            existing.save()
            print(f"  updated {row['slug']}")
        else:
            AboutSection.create(payload)
            print(f"  created {row['slug']}")


def seed_milestones_if_empty():
    if AboutMilestone.all() and len(list(AboutMilestone.all())) > 0:
        print("  milestones table not empty, skipping")
        return
    for i, (year, heading, body_html) in enumerate(MILESTONES):
        AboutMilestone.create({
            "year": year,
            "heading": heading,
            "body_html": body_html,
            "image_path": None,
            "sort_order": i + 1,
        })
        print(f"  created milestone {year} - {heading[:40]}")


if __name__ == "__main__":
    print("Seeding About LSPU sections...")
    upsert_sections()
    print("Seeding milestones...")
    seed_milestones_if_empty()
    print("Done.")
