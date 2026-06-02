const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, WidthType, BorderStyle, ShadingType, HeadingLevel, PageBreak } = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: "4472C4", type: ShadingType.CLEAR };

const createTableCell = (text, width, isHeader = false) => {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: isHeader ? headerShading : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({
        text: text,
        bold: isHeader,
        color: isHeader ? "FFFFFF" : "000000",
        font: "Arial",
        size: 22
      })]
    })]
  });
};

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "2E5090" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "4472C4" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: "bullet",
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }
        ]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("VI. PHÂN TÍCH KỊCH BẢN")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6.1. Kịch bản Lạc quan")]
      }),

      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Giả định:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Giá BĐS tăng 10-15% hàng năm",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Doanh thu cosmetics tăng 20% hàng năm",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Lãi suất vay ổn định ở 8%",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Kết quả: Vòng xoáy tự duy trì tốt. Tài sản BĐS gia tăng giá trị, doanh thu cosmetics đạt 72 tỷ VND/năm (từ 60 tỷ). Khả năng trả nợ tốt. Công ty có thể tiếp tục mở rộng.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6.2. Kịch bản Trung bình")]
      }),

      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Giả định:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Giá BĐS ổn định hoặc tăng 5% hàng năm",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Doanh thu cosmetics tăng 8-10% hàng năm",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Lãi suất tăng lên 9-10%",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Kết quả: Vòng xoáy tiếp tục nhưng tốc độ chậm hơn. Doanh thu cosmetics đạt 64-66 tỷ VND/năm. Khả năng trả nợ đủ nhưng lợi nhuận bị chia sẻ cho chi phí lãi suất cao hơn. Công ty cần quản lý chặt chẽ chi phí.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("6.3. Kịch bản Xấu")]
      }),

      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Giả định:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Giá BĐS giảm 10-20%",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Doanh thu cosmetics giảm 15-20% (do cạnh tranh, xu hướng thay đổi)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 120 },
        children: [new TextRun({
          text: "Lãi suất tăng lên 11-12%",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Kết quả: Vòng xoáy lật ngược. Doanh thu cosmetics giảm xuống 48-51 tỷ VND/năm. Giá trị BĐS thế chấp giảm mạnh → Ngân hàng yêu cầu bổ sung tài sản thế chấp hoặc thanh lý. Khả năng trả nợ bị ảnh hưởng nghiêm trọng. Công ty rơi vào tình trạng khủng hoảng.",
          font: "Arial",
          size: 22
        })]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 2340, 2340, 2340],
        rows: [
          new TableRow({
            children: [
              createTableCell("Yếu tố", 2340, true),
              createTableCell("Lạc quan", 2340, true),
              createTableCell("Trung bình", 2340, true),
              createTableCell("Xấu", 2340, true)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Tăng trưởng BĐS", 2340, false),
              createTableCell("10-15%/năm", 2340, false),
              createTableCell("5%/năm", 2340, false),
              createTableCell("-10-20%", 2340, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Tăng trưởng doanh thu", 2340, false),
              createTableCell("20%/năm", 2340, false),
              createTableCell("8-10%/năm", 2340, false),
              createTableCell("-15-20%", 2340, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Lãi suất", 2340, false),
              createTableCell("8%", 2340, false),
              createTableCell("9-10%", 2340, false),
              createTableCell("11-12%", 2340, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Doanh thu năm 1", 2340, false),
              createTableCell("72 tỷ VND", 2340, false),
              createTableCell("64-66 tỷ", 2340, false),
              createTableCell("48-51 tỷ", 2340, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Tình trạng", 2340, false),
              createTableCell("Tuyệt vời", 2340, false),
              createTableCell("Ổn định", 2340, false),
              createTableCell("Khủng hoảng", 2340, false)
            ]
          })
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      new Paragraph({ children: [new PageBreak()] })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/clever-intelligent-pasteur/mnt/DEMAN/Phan_Tich_Tai_Chinh_Deman_Oniiz_Part4.docx", buffer);
  console.log("Part 4 created successfully");
});
