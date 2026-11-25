"""Remove an unused fontkit intrinsic from the offline Firefox PDF writer."""
import hashlib


def remove_unused_eval_intrinsic(bundle):
    # The bundled intrinsic registry includes eval by reference. In this pinned
    # version its consumer requests Function to access apply and call. No PDF
    # or font data determines the intrinsic name.
    if hashlib.sha256(bundle).hexdigest() != "65717317f1c58384983038e588564f8fe3c736b992dbc216d8fd7237abd70eb1":
        raise ValueError("Review fontkit intrinsic lookups in the new PDF writer before packaging Firefox")
    entry = b'"%eval%":eval,'
    if bundle.count(entry) != 1:
        raise ValueError("Expected one eval entry in the PDF writer intrinsic registry")
    return bundle.replace(entry, b"")
