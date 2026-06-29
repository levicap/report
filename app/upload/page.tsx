import { UploadCloud } from "lucide-react";

export default function UploadPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Upload</h1>
          <p>Manual intake stores the original file, hashes it, classifies it, and runs the parser registry.</p>
        </div>
      </div>

      <section className="panel upload-box">
        <form action="/api/upload" method="post" encType="multipart/form-data" className="grid">
          <label className="file-input">
            <input
              name="file"
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg"
              required
            />
          </label>
          <label className="check-row">
            <input name="reprocess_duplicate" type="checkbox" />
            <span>Reprocess duplicate</span>
          </label>
          <button className="button" type="submit">
            <UploadCloud size={16} aria-hidden="true" />
            Upload and Parse
          </button>
        </form>
      </section>
    </>
  );
}
