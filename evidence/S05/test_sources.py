from pathlib import Path
import importlib.util,json,os,shutil,tempfile,unittest
from check_sources import check,checked_file,sha,extract
R=Path(__file__).resolve().parents[2]
class Sources(unittest.TestCase):
    def test_original_bytes_and_expected_open_status(self):
        out=check(os.environ['S05_SOURCES'],os.environ['S05_WORKBOOK']);self.assertFalse(out['product_installed']);self.assertEqual(out['original_platform_members'],8)
    def test_changed_workbook_rejected(self):
        with tempfile.TemporaryDirectory()as t:
            p=Path(t)/'workbook.pdf';p.write_bytes(Path(os.environ['S05_WORKBOOK']).read_bytes()+b'changed')
            with self.assertRaisesRegex(ValueError,'SOURCE_BYTES_CHANGED'):check(os.environ['S05_SOURCES'],p)
    def test_changed_source_archive_rejected(self):
        with tempfile.TemporaryDirectory()as t:
            p=Path(t)/'sources.zip';p.write_bytes(Path(os.environ['S05_SOURCES']).read_bytes()+b'changed')
            with self.assertRaisesRegex(ValueError,'SOURCE_BYTES_CHANGED'):check(p,os.environ['S05_WORKBOOK'])
    def test_source_symlink_rejected_even_when_bytes_match(self):
        with tempfile.TemporaryDirectory()as t:
            p=Path(t)/'workbook.pdf';p.symlink_to(Path(os.environ['S05_WORKBOOK']))
            with self.assertRaisesRegex(ValueError,'SOURCE_FILE_TYPE'):check(os.environ['S05_SOURCES'],p)
    def test_extraction_never_overwrites_existing_directory(self):
        with tempfile.TemporaryDirectory()as t:
            p=Path(t)/'destination';p.mkdir();marker=p/'keep';marker.write_text('original')
            with self.assertRaises(FileExistsError):extract(os.environ['S05_SOURCES'],os.environ['S05_WORKBOOK'],p)
            self.assertEqual(marker.read_text(),'original');self.assertEqual(len(list(p.iterdir())),1)
if __name__=='__main__':unittest.main()
