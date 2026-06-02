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
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: "decimal",
            text: "%1.",
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
        children: [new TextRun("VII. PHƯƠNG ÁN LIÊN DOANH (JOINT VENTURE)")]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Ngoài chiến lược đòn bẩy tài chính nội bộ, công ty có thể cân nhắc liên doanh với các đối tác chiến lược (các công ty trong lĩnh vực mỹ phẩm, bất động sản, hoặc logistics). Lợi ích của JV:",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Chia sẻ vốn: Đối tác cung cấp thêm vốn → Giảm áp lực nợ",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Chia sẻ rủi ro: Nếu kinh doanh gặp khó khăn, rủi ro được chia với đối tác",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Kỹ thuật & kinh nghiệm: Tiếp cận công nghệ, thị trường, mạng lưới của đối tác",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Tăng tính minh bạch: JV thường có quản lý chuyên nghiệp hơn, giảm rủi ro quản lý",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Tuy nhiên, JV cũng có nhược điểm: Mất quyền tự chủ, phải chia lợi nhuận, có thể xảy ra xung đột lợi ích với đối tác. Cần cân nhắc kỹ lưỡng trước khi quyết định.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("VIII. KHUYẾN NGHỊ VÀ LỘ TRÌNH THỰC HIỆN")]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("8.1. Nguyên tắc an toàn tài chính")]
      }),

      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Giới hạn tỷ lệ Nợ/Vốn (D/E ratio) ≤ 2:1. Điều này tức là Nợ không vượt quá 2 lần Vốn chủ sở hữu. Nếu D/E ratio vượt 2.5:1, ngừng vay thêm và tập trung trả nợ.",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Dự phòng rủi ro: Dành 10-15% lợi nhuận hàng năm vào quỹ dự phòng để ứng phó với khủng hoảng (BĐS giảm giá, doanh thu sụt, lãi suất tăng)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Thanh khoản: Luôn giữ quỹ lưu động tối thiểu 2-3 tháng chi phí hoạt động",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Lãi suất cố định: Cân nhắc khóa lãi suất dài hạn (1-3 năm) để tránh biến động lãi suất",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("8.2. Lộ trình thực hiện 3 giai đoạn")]
      }),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2340, 3510, 3510],
        rows: [
          new TableRow({
            children: [
              createTableCell("Giai đoạn", 2340, true),
              createTableCell("Thời gian", 3510, true),
              createTableCell("Nội dung chính", 3510, true)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Giai đoạn 1", 2340, false),
              createTableCell("0-6 tháng", 3510, false),
              createTableCell("Chuẩn bị pháp lý; Mua BĐS đầu tiên; Vay theo collateral inventory", 3510, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Giai đoạn 2", 2340, false),
              createTableCell("6-12 tháng", 3510, false),
              createTableCell("Đăng ký BĐS; Thế chấp BĐS; Vay vốn SXKD; Mở rộng sản xuất", 3510, false)
            ]
          }),
          new TableRow({
            children: [
              createTableCell("Giai đoạn 3", 2340, false),
              createTableCell("12-24 tháng", 3510, false),
              createTableCell("Tái đầu tư BĐS; Tăng doanh thu; Trả nợ; Lặp lại vòng 1-2", 3510, false)
            ]
          })
        ]
      }),

      new Paragraph({ spacing: { after: 240 }, children: [new TextRun("")] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("8.3. KPIs theo dõi (Key Performance Indicators)")]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Doanh thu hàng tháng (target: tăng 1-2% hàng tháng)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "D/E ratio (target: ≤ 2:1)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Giá trị BĐS sở hữu (target: tăng 5-10% hàng năm)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Tỷ suất lợi nhuận ròng (Net Margin) (target: ≥ 15%)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Khả năng thanh toán (Current Ratio, target: ≥ 1.5)",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Thời gian trả nợ (Debt Service Coverage Ratio, target: > 2.0)",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({ children: [new PageBreak()] }),

      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun("IX. KẾT LUẬN")]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Chiến lược đòn bẩy tài chính đưa ra cho Công ty Deman là một cách tiếp cận tích cực và thực tế để gia tăng khả năng tài chính và mở rộng kinh doanh. Nó lợi dụng dòng tiền ổn định của công ty và xu hướng tăng giá bất động sản để tạo ra một vòng xoáy tự duy trì tăng trưởng.",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Tuy nhiên, thành công của chiến lược này phụ thuộc rất nhiều vào:",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Sự ổn định và tăng trưởng của doanh số cosmetics",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Tình trạng thị trường bất động sản",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        children: [new TextRun({
          text: "Biến động lãi suất",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "numbers", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Quản lý rủi ro chặt chẽ và kỷ luật tài chính",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Khuyến nghị chính:",
          bold: true,
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Bắt đầu nhỏ: Mua BĐS thứ 1 trị giá ~2-3 tỷ VND (khoảng 3-6 tháng doanh thu) để kiểm định chiến lược",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Đảm bảo pháp lý: Chuẩn bị hợp đồng, sổ đỏ, SĐKR chắc chắn trước khi vay",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Quản lý nợ: Theo dõi chặt D/E ratio, không vượt quá 2:1",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Duy trì dòng tiền: Không dùng toàn bộ doanh thu để trả nợ, cần có quỹ dự phòng 10-15%",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({
          text: "Xem xét JV: Nếu muốn giảm rủi ro, có thể tìm đối tác liên doanh",
          font: "Arial",
          size: 22
        })]
      }),
      new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Theo dõi KPIs: Hàng tháng/quý, kiểm tra doanh thu, D/E, giá BĐS, lợi nhuận",
          font: "Arial",
          size: 22
        })]
      }),

      new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({
          text: "Tóm lại, chiến lược này là khả thi và có tiềm năng cao để gia tăng giá trị công ty nếu được thực hiện một cách thận trọng và có kỷ luật. Công ty Deman nên tiến hành chi tiết hơn với phân tích tài chính chuyên sâu, lên kế hoạch cụ thể, và tìm kiếm sự hỗ trợ từ các chuyên gia tài chính trước khi bắt đầu thực hiện.",
          font: "Arial",
          size: 22
        })]
      })
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/sessions/clever-intelligent-pasteur/mnt/DEMAN/Phan_Tich_Tai_Chinh_Deman_Oniiz_Part5.docx", buffer);
  console.log("Part 5 created successfully");
});
