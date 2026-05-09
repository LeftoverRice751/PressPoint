"""AboutController — kiosk-side About LSPU page.

Frontend-only stub: section content is hardcoded here so the kiosk
template renders end-to-end without database setup. Backend (DB-backed
sections, editor saves, sanitisation) is implemented in a later phase.
"""

from masonite.controllers import Controller
from masonite.views import View


SECTION_SLUGS = ["mission", "values", "history", "quality", "hymn", "seal"]


def _stub_data():
    """Placeholder content for the six sections + history milestones.

    Mirrors the shape the DB-backed loader will return later:
      sections[slug] -> object with title, body_html, subsections, image_path
      milestones     -> ordered list of timeline entries
    Lambdas are not used; we return plain dicts and let the template
    use attribute access through Jinja's getattr fallback.
    """

    def section(title, body_html=None, subsections=None, image_path=None):
        return {
            "title": title,
            "body_html": body_html,
            "subsections": subsections,
            "image_path": image_path,
        }

    sections = {
        "mission": section(
            "Mission, Vision & Mandate",
            subsections=[
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
        ),
        "values": section(
            "Group Values & Performance Pledge",
            subsections=[
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
        ),
        "history": section(
            "Historical Development",
            body_html="<p>From a single agricultural high school to a multi-campus polytechnic university — these are the milestones that shaped LSPU.</p>",
        ),
        "quality": section(
            "Quality Policy",
            body_html=(
                "<p>The Laguna State Polytechnic University is committed to provide "
                "quality higher and advanced education, research, extension, and "
                "production services that consistently conform to customer requirements "
                "and applicable statutory and regulatory mandates through continual "
                "improvement of the Quality Management System.</p>"
            ),
        ),
        "hymn": section(
            "University Hymn",
            body_html=(
                "<p>Hail, hail to thee, our Alma Mater dear<br>"
                "Laguna State Polytechnic University<br>"
                "Source of knowledge, wisdom, light and love<br>"
                "Forever we shall sing thy praise.</p>"
                "<p>With heads held high we'll bring thee honor and fame<br>"
                "Truth and excellence will guide our way<br>"
                "Loyal sons and daughters we shall be<br>"
                "LSPU, we pledge to thee.</p>"
            ),
        ),
        "seal": section(
            "University Seal",
            body_html=(
                "<p>The University Seal embodies LSPU's commitment to academic excellence, "
                "service to community, and rootedness in the Laguna heritage. The torch "
                "represents enlightenment, the open book signifies knowledge, and the "
                "encircling laurel honors achievement and unity across all campuses.</p>"
            ),
        ),
    }

    milestones = [
        {
            "year": "1952",
            "heading": "Founding as Baybay Rural High School",
            "body_html": "<p>Established as a rural high school serving the agricultural communities of southern Laguna.</p>",
            "image_path": None,
        },
        {
            "year": "1957",
            "heading": "Conversion to Baybay Agricultural School",
            "body_html": "<p>Reorganized to focus on agricultural education and vocational training.</p>",
            "image_path": None,
        },
        {
            "year": "1983",
            "heading": "Becomes Laguna College of Arts and Trades",
            "body_html": "<p>Expanded into arts, trades, and technology programs serving a broader student base.</p>",
            "image_path": None,
        },
        {
            "year": "2007",
            "heading": "Charter as Laguna State Polytechnic University",
            "body_html": "<p>Republic Act No. 9402 elevated the institution to university status, integrating multiple campuses across Laguna.</p>",
            "image_path": None,
        },
        {
            "year": "Today",
            "heading": "A Multi-Campus Polytechnic University",
            "body_html": "<p>LSPU continues to grow as a premier polytechnic university in CALABARZON, offering diverse programs in arts, sciences, technology, and education.</p>",
            "image_path": None,
        },
    ]

    return {"sections": sections, "milestones": milestones}


class AboutController(Controller):
    def kiosk(self, view: View):
        data = _stub_data()
        return view.render(
            "kiosk/about-lspu",
            {
                "sections": data["sections"],
                "ordered_slugs": SECTION_SLUGS,
                "milestones": data["milestones"],
            },
        )
