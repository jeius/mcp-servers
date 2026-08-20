from pypdf import PdfWriter
from pypdf.generic import (
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
)


def make_page_resources():
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    return DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
    )


def make_contents(text):
    contents = DecodedStreamObject()
    contents.set_data(f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET\n".encode("latin-1"))
    return contents


w = PdfWriter()
for label in ["Page one content", "Page two content"]:
    page = w.add_blank_page(width=612, height=792)
    page[NameObject("/Resources")] = make_page_resources()
    page[NameObject("/Contents")] = w._add_object(make_contents(label))

w.add_metadata(
    {
        "/Title": "Sample PDF",
        "/Author": "Test Author",
        "/Subject": "Testing",
        "/Keywords": "foo, bar, baz",
        "/Creator": "TestCreator",
    }
)
with open("tests/fixtures/sample.pdf", "wb") as f:
    w.write(f)

w2 = PdfWriter(clone_from="tests/fixtures/sample.pdf")
w2.encrypt(user_password="secret", owner_password="secret")
with open("tests/fixtures/encrypted.pdf", "wb") as f:
    w2.write(f)

with open("tests/fixtures/not-pdf.txt", "wb") as f:
    f.write(b"this is not a pdf at all\n")

print("OK")